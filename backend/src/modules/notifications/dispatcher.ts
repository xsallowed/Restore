import { sql, enqueueJob } from '../../lib/db';
import { logger } from '../../lib/logger';

type NotificationChannel = 'email' | 'webhook' | 'inapp';
type NotificationTier = 'BRONZE' | 'SILVER' | 'GOLD';

interface Notification {
  tier: NotificationTier;
  eventId?: string;
  userId?: string;     // specific user, or null for broadcast
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}

// ─── Tier-based notification rules ───────────────────────────────────────────
// Bronze: step assignment, escalation acknowledgement
// Silver: new escalation, critical path blocked, event status change, IC override
// Gold:   service status transition to DOWN, TTFR breach, confidence score drop

export async function notifyStepAssigned(stepId: string, assigneeId: string, eventId: string) {
  const [step] = await sql<{ name: string }[]>`SELECT name FROM soe_steps WHERE id = ${stepId}`;
  const [user]  = await sql<{ email: string; display_name: string }[]>`SELECT email, display_name FROM users WHERE id = ${assigneeId}`;
  const [event] = await sql<{ title: string; severity: string }[]>`SELECT title, severity FROM recovery_events WHERE id = ${eventId}`;
  if (!step || !user || !event) return;

  await enqueueJob('send_notification', {
    tier: 'BRONZE',
    channel: 'email',
    recipient: user.email,
    subject: `[${event.severity}] Step assigned: ${step.name}`,
    body: `Hi ${user.display_name},\n\nYou have been assigned the following step in the recovery event "${event.title}":\n\n${step.name}\n\nPlease log in to Restore to view your task and begin execution.\n\nRestore Platform`,
  });
}

export async function notifyEscalation(escalationId: string) {
  const [esc] = await sql<{
    event_id: string; description: string; severity: string;
    recovery_events: { title: string; commander_id: string };
  }[]>`
    SELECT e.*, re.title, re.commander_id
    FROM escalations e
    JOIN recovery_events re ON re.id = e.event_id
    WHERE e.id = ${escalationId}
  `;
  if (!esc) return;

  const [commander] = await sql<{ email: string; display_name: string }[]>`
    SELECT email, display_name FROM users WHERE id = ${esc.recovery_events?.commander_id}`;
  if (!commander) return;

  await enqueueJob('send_notification', {
    tier: 'SILVER',
    channel: 'email',
    recipient: commander.email,
    subject: `[ESCALATION ${esc.severity}] ${esc.recovery_events?.title}`,
    body: `A ${esc.severity} escalation has been raised:\n\n${esc.description}\n\nPlease review in Restore immediately.`,
  });

  // Also send to webhook if configured (Teams/Slack)
  if (process.env.WEBHOOK_URL) {
    await enqueueJob('send_notification', {
      tier: 'SILVER',
      channel: 'webhook',
      recipient: process.env.WEBHOOK_URL,
      subject: `Escalation: ${esc.severity}`,
      body: `*[ESCALATION ${esc.severity}]* ${esc.recovery_events?.title}\n${esc.description}`,
    });
  }
}

export async function notifyGoldThresholdBreach(params: {
  eventId: string;
  businessServiceName: string;
  breachType: 'SERVICE_DOWN' | 'TTFR_BREACH' | 'CONFIDENCE_DROP';
  details: string;
}) {
  // Find all Gold-tier users
  const goldUsers = await sql<{ email: string; display_name: string }[]>`
    SELECT email, display_name FROM users WHERE tier = 'GOLD' AND is_active = TRUE
  `;

  const subjectMap = {
    SERVICE_DOWN:    `[CRITICAL] Service Down: ${params.businessServiceName}`,
    TTFR_BREACH:     `[WARNING] Recovery behind schedule: ${params.businessServiceName}`,
    CONFIDENCE_DROP: `[ALERT] Recovery confidence low: ${params.businessServiceName}`,
  };

  for (const user of goldUsers) {
    await enqueueJob('send_notification', {
      tier: 'GOLD',
      channel: 'email',
      recipient: user.email,
      subject: subjectMap[params.breachType],
      body: `Hi ${user.display_name},\n\n${params.details}\n\nLog in to the Restore Executive Dashboard for the current status.\n\nRestore Platform`,
    }, { priority: 1 });
  }

  // Teams/Slack webhook for Gold
  if (process.env.WEBHOOK_URL_GOLD || process.env.WEBHOOK_URL) {
    await enqueueJob('send_notification', {
      tier: 'GOLD',
      channel: 'webhook',
      recipient: process.env.WEBHOOK_URL_GOLD || process.env.WEBHOOK_URL!,
      subject: subjectMap[params.breachType],
      body: params.details,
    }, { priority: 1 });
  }
}

export async function notifyServiceStatusChange(serviceId: string, newStatus: string) {
  if (newStatus !== 'DOWN') return; // Only alert Gold on DOWN transitions
  const [service] = await sql<{ name: string; rto_minutes: number }[]>`
    SELECT name, rto_minutes FROM business_services WHERE id = ${serviceId}
  `;
  if (!service) return;

  await notifyGoldThresholdBreach({
    eventId: serviceId,
    businessServiceName: service.name,
    breachType: 'SERVICE_DOWN',
    details: `${service.name} has transitioned to DOWN status. RTO target is ${service.rto_minutes} minutes. Recovery operations should be initiated immediately.`,
  });
}

// Send notification job handler (called by worker)
export async function sendNotificationJob(payload: {
  tier: string;
  channel: string;
  recipient: string;
  subject: string;
  body: string;
}): Promise<void> {
  const { channel, recipient, subject, body, tier } = payload;

  logger.info('Sending notification', { tier, channel, recipient: recipient.substring(0, 20) + '…' });

  if (channel === 'email') {
    if (!process.env.SMTP_HOST) {
      logger.warn('SMTP not configured — email notification skipped');
      return;
    }
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'restore@org.com',
      to: recipient,
      subject: `[Restore] ${subject}`,
      text: body,
      html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${body}</pre>`,
    });

  } else if (channel === 'webhook') {
    const axios = await import('axios');
    // Detect Teams vs Slack format
    const isTeams = recipient.includes('webhook.office.com');
    const webhookBody = isTeams
      ? { '@type': 'MessageCard', '@context': 'http://schema.org/extensions', summary: subject, themeColor: tier === 'GOLD' ? '1E6B3A' : '185FA5', title: subject, text: body }
      : { text: `*${subject}*\n${body}` }; // Slack format
    await axios.default.post(recipient, webhookBody, { timeout: 10000 });
  }
}
