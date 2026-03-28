import { sql, enqueueJob } from './lib/db';
import { logger } from './lib/logger';
import { generateSOE } from './modules/runbook/soeGenerator';
// SSE broadcasts are handled by the main app process via PG NOTIFY triggers
// Worker writes to DB only; SSE clients receive updates automatically
const broadcastTTFRUpdate = (_eventId: string, _payload: unknown) => {};
import { runMLScoring, calculateRecoveryConfidence, calculateTTFRConfidence } from './modules/ml/intelligence';
import { sendNotificationJob } from './modules/notifications/dispatcher';
import { generateOperationalReport, generateExecutiveReport, generateRehearsalAssessmentReport } from './modules/reporting/reportGenerator';
// node-cron loaded lazily to prevent crash if not installed

const POLL_INTERVAL = parseInt(process.env.WORKER_POLL_INTERVAL_MS || '5000');

const handlers: Record<string, (payload: Record<string, unknown>) => Promise<void>> = {

  generate_soe: async (payload) => {
    const soeId = await generateSOE({
      eventId:            payload.eventId as string,
      eventType:          payload.eventType as string,
      severity:           payload.severity as string,
      affectedServiceIds: (payload.affectedServiceIds as string[]) || [],
      isRehearsal:        payload.isRehearsal as boolean,
    });
    await sql`UPDATE soes SET status = 'ACTIVE', activated_at = NOW() WHERE id = ${soeId}`;
    await sql`UPDATE recovery_events SET status = 'IN_PROGRESS' WHERE id = ${payload.eventId as string}`;
    logger.info('SOE activated', { soeId, eventId: payload.eventId });
    await enqueueJob('run_ml_scoring', { soeId, eventId: payload.eventId }, { priority: 2 });
  },

  run_ml_scoring: async (payload) => {
    await runMLScoring(payload.soeId as string, payload.eventId as string);
    const ttfr = await calculateTTFRConfidence(payload.soeId as string);
    const confidence = await calculateRecoveryConfidence({ soeId: payload.soeId as string, eventId: payload.eventId as string });
    broadcastTTFRUpdate(payload.eventId as string, {
      ttfrMinutes: ttfr.pointEstimateMinutes,
      confidenceLow: ttfr.p10Minutes,
      confidenceHigh: ttfr.p90Minutes,
      recoveryConfidenceScore: confidence.score / 100,
      completionPercentage: 0,
    });
  },

  recalculate_ttfr: async (payload) => {
    const { eventId, soeId } = payload as { eventId: string; soeId: string };
    const steps = await sql<{ status: string }[]>`SELECT status FROM soe_steps WHERE soe_id = ${soeId}`;
    const total = steps.length;
    const completed = steps.filter(s => s.status === 'COMPLETED').length;
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const ttfr = await calculateTTFRConfidence(soeId);
    const confidence = await calculateRecoveryConfidence({ soeId, eventId });

    await sql`
      UPDATE soes SET
        ml_ttfr_minutes = ${ttfr.pointEstimateMinutes},
        ml_ttfr_confidence_low = ${ttfr.p10Minutes},
        ml_ttfr_confidence_high = ${ttfr.p90Minutes},
        recovery_confidence_score = ${confidence.score / 100},
        updated_at = NOW()
      WHERE id = ${soeId}
    `;

    broadcastTTFRUpdate(eventId, {
      ttfrMinutes: ttfr.pointEstimateMinutes,
      confidenceLow: ttfr.p10Minutes,
      confidenceHigh: ttfr.p90Minutes,
      recoveryConfidenceScore: confidence.score / 100,
      completionPercentage: completionPct,
    });

    // Gold alert if confidence drops critically
    if (confidence.score < 30) {
      const [event] = await sql<{ title: string }[]>`SELECT title FROM recovery_events WHERE id = ${eventId}`;
      if (event) {
        const blocked = steps.filter(s => s.status === 'BLOCKED').length;
        const { notifyGoldThresholdBreach } = await import('./modules/notifications/dispatcher');
        await notifyGoldThresholdBreach({
          eventId, businessServiceName: event.title, breachType: 'CONFIDENCE_DROP',
          details: `Recovery confidence is ${confidence.score}%. ${blocked} step(s) blocked. Immediate intervention may be required.`,
        });
      }
    }
  },

  sync_connector: async (payload) => {
    const { connectorId } = payload as { connectorId: string };
    const [connector] = await sql`SELECT * FROM connectors WHERE id = ${connectorId} AND is_active = TRUE`;
    if (!connector) { logger.warn('Connector not found', { connectorId }); return; }

    await sql`UPDATE connectors SET last_sync_status = 'RUNNING' WHERE id = ${connectorId}`;
    try {
      let documents: Array<{ sourceRef: string; title: string; content: string }> = [];
      if (connector.connector_type === 'GITHUB') {
        const { GitHubConnector } = await import('./connectors/github');
        documents = await new GitHubConnector(connector.config, connector.credential_ref).listAndFetch();
      } else if (connector.connector_type === 'CONFLUENCE') {
        const { ConfluenceConnector } = await import('./connectors/confluence');
        documents = await new ConfluenceConnector(connector.config, connector.credential_ref).listAndFetch();
      } else if (connector.connector_type === 'HTTP') {
        const { HttpConnector } = await import('./connectors/confluence');
        documents = await new HttpConnector(connector.config, connector.credential_ref).listAndFetch();
      }

      const crypto = await import('crypto');
      for (const doc of documents) {
        const hash = crypto.createHash('sha256').update(doc.content).digest('hex');
        await sql`
          INSERT INTO runbooks (connector_id, source_ref, title, content_text, content_hash)
          VALUES (${connectorId}, ${doc.sourceRef}, ${doc.title}, ${doc.content}, ${hash})
          ON CONFLICT (connector_id, source_ref) DO UPDATE SET
            title = EXCLUDED.title, content_text = EXCLUDED.content_text,
            content_hash = EXCLUDED.content_hash, fetched_at = NOW(), updated_at = NOW()
          WHERE runbooks.content_hash != EXCLUDED.content_hash
        `;
      }
      await sql`UPDATE connectors SET last_synced_at = NOW(), last_sync_status = 'OK' WHERE id = ${connectorId}`;
      logger.info('Connector sync complete', { connectorId, count: documents.length });
    } catch (err) {
      await sql`UPDATE connectors SET last_sync_status = 'ERROR' WHERE id = ${connectorId}`;
      throw err;
    }
  },

  ingest_pdf: async (payload) => {
    const { storageKey, connectorId, fileName } = payload as { storageKey: string; connectorId: string; fileName: string };
    const { storage, extractPdfText } = await import('./storage/adapter');
    const buffer = await storage.get(storageKey);
    const text = await extractPdfText(buffer);
    if (!text.trim()) { logger.warn('PDF yielded no text', { storageKey }); return; }

    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    await sql`
      INSERT INTO runbooks (connector_id, source_ref, title, content_text, content_hash)
      VALUES (${connectorId}, ${'pdf:' + storageKey}, ${fileName.replace(/\.pdf$/i, '')}, ${text}, ${hash})
      ON CONFLICT (connector_id, source_ref) DO UPDATE SET
        content_text = EXCLUDED.content_text, content_hash = EXCLUDED.content_hash, fetched_at = NOW()
    `;
    logger.info('PDF ingested', { chars: text.length });
  },

  generate_report: async (payload) => {
    const { eventId, reportType, rehearsalId } = payload as { eventId: string; reportType: string; rehearsalId?: string };
    let report: Record<string, unknown>;
    if (reportType === 'EXECUTIVE') {
      report = await generateExecutiveReport(eventId) as unknown as Record<string, unknown>;
    } else if (reportType === 'REHEARSAL' && rehearsalId) {
      report = await generateRehearsalAssessmentReport(rehearsalId);
      await sql`UPDATE rehearsals SET assessment_report = ${sql.json(report)}, updated_at = NOW() WHERE id = ${rehearsalId}`;
    } else {
      report = await generateOperationalReport(eventId) as unknown as Record<string, unknown>;
    }
    logger.info('Report generated', { eventId, reportType });
  },

  send_notification: async (payload) => {
    await sendNotificationJob(payload as { tier: string; channel: string; recipient: string; subject: string; body: string });
  },
};

async function processNextJob(): Promise<boolean> {
  const [job] = await sql<{ id: string; job_type: string; payload: Record<string, unknown>; attempts: number; max_attempts: number }[]>`
    UPDATE jobs SET status = 'RUNNING', started_at = NOW(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status IN ('PENDING','FAILED') AND attempts < max_attempts AND run_at <= NOW()
      ORDER BY priority ASC, run_at ASC
      FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING *
  `;
  if (!job) return false;

  const handler = handlers[job.job_type];
  if (!handler) {
    await sql`UPDATE jobs SET status = 'DEAD', error_message = 'No handler' WHERE id = ${job.id}`;
    return true;
  }
  try {
    await handler(job.payload);
    await sql`UPDATE jobs SET status = 'COMPLETED', completed_at = NOW() WHERE id = ${job.id}`;
  } catch (err) {
    const isDead = job.attempts >= job.max_attempts;
    await sql`UPDATE jobs SET status = ${isDead ? 'DEAD' : 'FAILED'}, failed_at = NOW(), error_message = ${String(err)} WHERE id = ${job.id}`;
    logger.error('Job failed', { id: job.id, type: job.job_type, err: String(err) });
  }
  return true;
}

function setupCronJobs() {
  let cron: { schedule: (pattern: string, fn: () => void) => void };
  try { cron = require('node-cron'); } catch { logger.warn('node-cron not available, skipping scheduled jobs'); return; }
  cron.schedule('0 */6 * * *', async () => {
    const connectors = await sql<{ id: string }[]>`SELECT id FROM connectors WHERE is_active = TRUE`;
    for (const c of connectors) await enqueueJob('sync_connector', { connectorId: c.id }, { priority: 8 });
    logger.info('Scheduled connector syncs', { count: connectors.length });
  });
  cron.schedule('*/5 * * * *', async () => {
    const soes = await sql<{ id: string; event_id: string }[]>`
      SELECT s.id, s.event_id FROM soes s JOIN recovery_events e ON e.id = s.event_id
      WHERE s.status = 'ACTIVE' AND e.is_rehearsal = FALSE`;
    for (const s of soes) await enqueueJob('recalculate_ttfr', { soeId: s.id, eventId: s.event_id }, { priority: 3 });
  });
  cron.schedule('0 2 * * *', async () => {
    logger.info('Audit log export scheduled (configure S3 archival here)');
  });
  logger.info('Cron jobs scheduled');
}

async function runWorker() {
  logger.info('Restore worker starting', { pollInterval: POLL_INTERVAL });
  setupCronJobs();
  while (true) {
    try {
      const processed = await processNextJob();
      if (!processed) await new Promise(r => setTimeout(r, POLL_INTERVAL));
    } catch (err) {
      logger.error('Worker poll error', { err });
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
  }
}

runWorker();
