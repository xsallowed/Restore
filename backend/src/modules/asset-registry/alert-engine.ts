import { logger } from '../../lib/logger';
import nodemailer from 'nodemailer';

interface AlertEngineConfig {
  sql: any;
  smtpConfig?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
  };
}

interface AlertEvent {
  ruleId: string;
  assetId: string;
  message: string;
  severity: string;
  ownerEmail?: string;
}

let sqlInstance: any;
let smtpConfig: AlertEngineConfig['smtpConfig'];

export function initAlertEngine(config: AlertEngineConfig) {
  sqlInstance = config.sql;
  smtpConfig = config.smtpConfig;
}

async function createAlertEvent(event: AlertEvent) {
  try {
    const eventId = `ALERT-${Date.now()}-${Math.random().toString(36).substring(5)}`;
    await sqlInstance`
      INSERT INTO asset_alerts (alert_id, asset_id, alert_type, severity, status, owner_email, recommended_action)
      VALUES (${eventId}, ${event.assetId}, ${event.message}, ${event.severity}, 'Active', ${event.ownerEmail ?? null}, 'Review and remediate immediately')
      ON CONFLICT DO NOTHING
    `.catch(() => {});

    if (event.ownerEmail && smtpConfig) {
      await sendAlertEmail(event);
    }
  } catch (err) {
    logger.error('Failed to create alert event', { err: String(err) });
  }
}

async function sendAlertEmail(event: AlertEvent) {
  if (!smtpConfig) return;
  try {
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: { user: smtpConfig.user, pass: smtpConfig.pass },
    });

    await transporter.sendMail({
      from: smtpConfig.from,
      to: event.ownerEmail,
      subject: `[IT Asset Registry] ${event.severity} Alert: ${event.message}`,
      html: `
        <h2>IT Asset Registry Alert</h2>
        <p><strong>Severity:</strong> ${event.severity}</p>
        <p><strong>Asset ID:</strong> ${event.assetId}</p>
        <p><strong>Alert:</strong> ${event.message}</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p>Please log in to the IT Asset Registry to review and action this alert.</p>
      `,
    });
  } catch (err) {
    logger.error('Failed to send alert email', { err: String(err) });
  }
}

// ─── API KEY ALERTS ──────────────────────────────────────────────────────────

async function checkApiKeyAlerts() {
  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const overdue30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Key expiring in less than 14 days
  const expiringKeys = await sqlInstance`
    SELECT asset_id, key_name, owner_email, expiry_date FROM api_keys
    WHERE expiry_date IS NOT NULL AND expiry_date > NOW() AND expiry_date < ${in14Days}
    AND status = 'Active'
  `;
  for (const key of expiringKeys) {
    await createAlertEvent({
      ruleId: 'api-key-expiring',
      assetId: key.asset_id,
      message: `API key "${key.key_name}" expires on ${new Date(key.expiry_date).toLocaleDateString()}`,
      severity: 'High',
      ownerEmail: key.owner_email,
    });
  }

  // Key rotation overdue
  const rotationOverdue = await sqlInstance`
    SELECT asset_id, key_name, owner_email, next_rotation_due FROM api_keys
    WHERE next_rotation_due IS NOT NULL AND next_rotation_due < NOW() AND status = 'Active'
  `;
  for (const key of rotationOverdue) {
    await createAlertEvent({
      ruleId: 'api-key-rotation-overdue',
      assetId: key.asset_id,
      message: `API key "${key.key_name}" rotation is overdue since ${new Date(key.next_rotation_due).toLocaleDateString()}`,
      severity: 'High',
      ownerEmail: key.owner_email,
    });
  }

  // Key found in source code — immediate critical alert
  const exposedKeys = await sqlInstance`
    SELECT asset_id, key_name, owner_email FROM api_keys
    WHERE exposed_in_code = TRUE AND risk_level != 'Critical'
  `;
  for (const key of exposedKeys) {
    await createAlertEvent({
      ruleId: 'api-key-exposed-in-code',
      assetId: key.asset_id,
      message: `CRITICAL: API key "${key.key_name}" has been detected in source code repository`,
      severity: 'Critical',
      ownerEmail: key.owner_email,
    });
    // Update risk level to Critical
    await sqlInstance`UPDATE api_keys SET risk_level = 'Critical' WHERE asset_id = ${key.asset_id}`.catch(() => {});
  }

  // Non-expiring key in production
  const nonExpiringProd = await sqlInstance`
    SELECT asset_id, key_name, owner_email FROM api_keys
    WHERE expiry_date IS NULL AND environment = 'Production' AND status = 'Active'
  `;
  for (const key of nonExpiringProd) {
    await createAlertEvent({
      ruleId: 'api-key-no-expiry-prod',
      assetId: key.asset_id,
      message: `API key "${key.key_name}" has no expiry date in Production environment`,
      severity: 'High',
      ownerEmail: key.owner_email,
    });
  }
}

// ─── USER IDENTITY ALERTS ────────────────────────────────────────────────────

async function checkUserIdentityAlerts() {
  // Orphaned accounts (employee left, account still active)
  const orphaned = await sqlInstance`
    SELECT asset_id, display_name, email FROM user_identities
    WHERE orphaned = TRUE AND account_status = 'Active'
  `;
  for (const user of orphaned) {
    await createAlertEvent({
      ruleId: 'user-orphaned-account',
      assetId: user.asset_id,
      message: `Orphaned account detected: "${user.display_name}" (${user.email}) — employee has left but account is still Active`,
      severity: 'Critical',
      ownerEmail: user.email,
    });
  }

  // Privileged account with MFA disabled
  const privNoMFA = await sqlInstance`
    SELECT asset_id, display_name, email FROM user_identities
    WHERE privileged_access = TRUE AND mfa_enabled = FALSE AND account_status = 'Active'
  `;
  for (const user of privNoMFA) {
    await createAlertEvent({
      ruleId: 'user-privileged-no-mfa',
      assetId: user.asset_id,
      message: `Privileged account "${user.display_name}" has MFA disabled`,
      severity: 'Critical',
      ownerEmail: user.email,
    });
  }

  // Dormant accounts (90+ days no login)
  const dormant = await sqlInstance`
    SELECT asset_id, display_name, email, last_login_date FROM user_identities
    WHERE dormant = FALSE AND last_login_date < NOW() - INTERVAL '90 days' AND account_status = 'Active'
  `;
  for (const user of dormant) {
    // Mark as dormant
    await sqlInstance`UPDATE user_identities SET dormant = TRUE WHERE asset_id = ${user.asset_id}`.catch(() => {});
    await createAlertEvent({
      ruleId: 'user-dormant',
      assetId: user.asset_id,
      message: `Account "${user.display_name}" has been dormant for 90+ days (last login: ${user.last_login_date ? new Date(user.last_login_date).toLocaleDateString() : 'never'})`,
      severity: 'High',
      ownerEmail: user.email,
    });
  }

  // Failed login threshold exceeded (>10 in 24h)
  const failedLogins = await sqlInstance`
    SELECT asset_id, display_name, email, failed_login_count FROM user_identities
    WHERE failed_login_count > 10 AND account_status = 'Active'
  `;
  for (const user of failedLogins) {
    await createAlertEvent({
      ruleId: 'user-failed-logins',
      assetId: user.asset_id,
      message: `Account "${user.display_name}" has ${user.failed_login_count} failed login attempts`,
      severity: 'Critical',
      ownerEmail: user.email,
    });
  }

  // Access review overdue
  const reviewOverdue = await sqlInstance`
    SELECT asset_id, display_name, email, access_review_due FROM user_identities
    WHERE access_review_due IS NOT NULL AND access_review_due < NOW() AND account_status = 'Active'
  `;
  for (const user of reviewOverdue) {
    await createAlertEvent({
      ruleId: 'user-access-review-overdue',
      assetId: user.asset_id,
      message: `Access review overdue for "${user.display_name}" (due: ${new Date(user.access_review_due).toLocaleDateString()})`,
      severity: 'Medium',
      ownerEmail: user.email,
    });
  }
}

// ─── EXTERNAL CONNECTION ALERTS ──────────────────────────────────────────────

async function checkExternalConnectionAlerts() {
  // Unauthorised connections
  const unauthorised = await sqlInstance`
    SELECT asset_id, connection_name, remote_endpoint FROM asset_ext_connections
    WHERE status = 'Unauthorised'
  `;
  for (const conn of unauthorised) {
    await createAlertEvent({
      ruleId: 'connection-unauthorised',
      assetId: conn.asset_id,
      message: `Unauthorised external connection detected: "${conn.connection_name}" to ${conn.remote_endpoint}`,
      severity: 'Critical',
    });
  }

  // Unencrypted connections
  const noEncryption = await sqlInstance`
    SELECT asset_id, connection_name, remote_endpoint FROM asset_ext_connections
    WHERE encryption_in_transit = FALSE AND status = 'Active'
  `;
  for (const conn of noEncryption) {
    await createAlertEvent({
      ruleId: 'connection-no-encryption',
      assetId: conn.asset_id,
      message: `Active connection "${conn.connection_name}" to ${conn.remote_endpoint} has no encryption in transit`,
      severity: 'Critical',
    });
  }

  // Connection expiry approaching within 30 days
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const expiringConns = await sqlInstance`
    SELECT asset_id, connection_name FROM asset_ext_connections
    WHERE approved_date IS NOT NULL
    AND approved_date < ${in30Days}
    AND status = 'Active'
  `;
  for (const conn of expiringConns) {
    await createAlertEvent({
      ruleId: 'connection-expiring',
      assetId: conn.asset_id,
      message: `External connection "${conn.connection_name}" requires review within 30 days`,
      severity: 'Medium',
    });
  }

  // No business_purpose documented
  const noPurpose = await sqlInstance`
    SELECT asset_id, connection_name FROM asset_ext_connections
    WHERE (business_purpose IS NULL OR business_purpose = '') AND status = 'Active'
  `;
  for (const conn of noPurpose) {
    await createAlertEvent({
      ruleId: 'connection-no-purpose',
      assetId: conn.asset_id,
      message: `External connection "${conn.connection_name}" has no documented business purpose`,
      severity: 'High',
    });
  }
}

// ─── MAIN EVALUATION LOOP ───────────────────────────────────────────────────

export async function runAlertEvaluation() {
  logger.info('Running alert evaluation...');
  try {
    await checkApiKeyAlerts();
    await checkUserIdentityAlerts();
    await checkExternalConnectionAlerts();
    logger.info('Alert evaluation complete');
  } catch (err) {
    logger.error('Alert evaluation failed', { err: String(err) });
  }
}

export async function scheduleAlertEvaluation(intervalMinutes = 60) {
  runAlertEvaluation(); // Run immediately
  setInterval(() => runAlertEvaluation(), intervalMinutes * 60 * 1000);
}
