import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sql, writeAuditEntry, enqueueJob } from '../lib/db';
import { requireAuth, requireTier, requireMinTier } from '../middleware/auth';
import { goldDataFilter, aggregateForGold } from '../middleware/goldFilter';
import { setupSSE } from '../lib/sse';
import { generateSOE } from '../modules/runbook/soeGenerator';
import { issueToken } from '../middleware/auth';
import { logger } from '../lib/logger';

export const router = Router();

// ─── Auth ──────────────────────────────────────────────────────────────────
router.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const email    = req.body?.email    as string | undefined;
    const password = req.body?.password as string | undefined;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const users = await sql<{ id: string; email: string; display_name: string; tier: string; roles: string[]; password_hash: string }[]>`
      SELECT id, email, display_name, tier, roles, password_hash FROM users WHERE email = ${email} AND is_active = TRUE
    `;
    const user = users[0];
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid credentials' });

    const bcryptMod = require('bcryptjs');
    const compareFn = typeof bcryptMod.compare === 'function' ? bcryptMod.compare : bcryptMod.default?.compare;
    if (typeof compareFn !== 'function') return res.status(500).json({ error: 'Auth module error' });

    const valid = await compareFn(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = issueToken({ id: user.id, email: user.email, displayName: user.display_name, tier: user.tier as never, roles: user.roles });
    await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`;
    await writeAuditEntry({ userId: user.id, userTier: user.tier, action: 'USER_LOGIN', ipAddress: req.ip });
    return res.json({ data: { token, user: { id: user.id, email: user.email, displayName: user.display_name, tier: user.tier } } });
  } catch (err) {
    logger.error('Login error', { err: String(err) });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/auth/me', requireAuth, (req: Request, res: Response) => {
  res.json({ data: req.user });
});

// ─── SSE ───────────────────────────────────────────────────────────────────
router.get('/stream', requireAuth, setupSSE);

// ─── Assets ────────────────────────────────────────────────────────────────
router.get('/assets', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  const assets = await sql`
    SELECT a.*, array_agg(DISTINCT bs.name) FILTER (WHERE bs.id IS NOT NULL) as business_services
    FROM assets a
    LEFT JOIN business_service_assets bsa ON bsa.asset_id = a.id
    LEFT JOIN business_services bs ON bs.id = bsa.business_service_id
    WHERE a.environment = 'PRODUCTION'
    GROUP BY a.id
    ORDER BY a.criticality_tier, a.name
  `;
  res.json({ data: assets });
});

router.post('/assets', requireAuth, requireMinTier('ADMIN'), async (req: Request, res: Response) => {
  const schema = z.object({
    name: z.string().min(1),
    assetType: z.string(),
    environment: z.enum(['PRODUCTION', 'STAGING', 'DR', 'DEV']).default('PRODUCTION'),
    owner: z.string().optional(),
    criticalityTier: z.number().int().min(1).max(4).default(2),
    location: z.string().optional(),
    recoveryGroup: z.string().optional(),
  });
  const data = schema.parse(req.body);
  const [asset] = await sql`
    INSERT INTO assets (name, asset_type, environment, owner, criticality_tier, location, recovery_group)
    VALUES (${data.name}, ${data.assetType}, ${data.environment}, ${data.owner ?? null},
            ${data.criticalityTier}, ${data.location ?? null}, ${data.recoveryGroup ?? null})
    RETURNING *
  `;
  await writeAuditEntry({ userId: req.user!.sub, userTier: req.user!.restore_tier, action: 'ASSET_CREATED', objectType: 'ASSET', objectId: asset.id, afterState: asset });
  res.status(201).json({ data: asset });
});

router.post('/assets/:id/blast-radius', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const blastRadius = await sql`SELECT * FROM get_blast_radius(${id}::uuid)`;
  const assetIds = blastRadius.map((r: { asset_id: string }) => r.asset_id);

  const assets = await sql`SELECT * FROM assets WHERE id = ANY(${assetIds})`;
  const services = await sql`
    SELECT DISTINCT bs.* FROM business_services bs
    JOIN business_service_assets bsa ON bsa.business_service_id = bs.id
    WHERE bsa.asset_id = ANY(${assetIds})
    ORDER BY bs.impact_tier
  `;

  res.json({ data: { affectedAssets: assets, affectedServices: services, depth: blastRadius } });
});

// ─── Business Services ─────────────────────────────────────────────────────
router.get('/business-services', requireAuth, async (req: Request, res: Response) => {
  const services = await sql`
    SELECT bs.*,
      COUNT(DISTINCT bsa.asset_id) as asset_count,
      COUNT(DISTINCT bsa.asset_id) FILTER (WHERE a.status != 'HEALTHY') as unhealthy_asset_count
    FROM business_services bs
    LEFT JOIN business_service_assets bsa ON bsa.business_service_id = bs.id
    LEFT JOIN assets a ON a.id = bsa.asset_id
    GROUP BY bs.id
    ORDER BY bs.impact_tier, bs.name
  `;
  res.json({ data: services });
});

// ─── Events ────────────────────────────────────────────────────────────────
router.post('/events', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  const schema = z.object({
    title: z.string().min(1),
    eventType: z.string(),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']),
    affectedServiceIds: z.array(z.string().uuid()).default([]),
    notes: z.string().optional(),
    isRehearsal: z.boolean().default(false),
  });
  const data = schema.parse(req.body);

  const [event] = await sql`
    INSERT INTO recovery_events (title, event_type, severity, affected_service_ids, notes, opened_by, commander_id, is_rehearsal)
    VALUES (${data.title}, ${data.eventType}, ${data.severity}, ${data.affectedServiceIds},
            ${data.notes ?? null}, ${req.user!.sub}, ${req.user!.sub}, ${data.isRehearsal})
    RETURNING *
  `;

  await writeAuditEntry({ eventId: event.id, userId: req.user!.sub, userTier: req.user!.restore_tier, action: 'EVENT_OPENED', objectType: 'RECOVERY_EVENT', objectId: event.id, afterState: event, isRehearsal: data.isRehearsal });

  // Enqueue SOE generation as background job
  await enqueueJob('generate_soe', {
    eventId: event.id,
    eventType: data.eventType,
    severity: data.severity,
    affectedServiceIds: data.affectedServiceIds,
    isRehearsal: data.isRehearsal,
  }, { priority: 1 });

  res.status(201).json({ data: event });
});

router.get('/events', requireAuth, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const isRehearsal = req.query.rehearsal === 'true';

    const events = status
      ? await sql`
          SELECT e.*, u.display_name as commander_name
          FROM recovery_events e
          LEFT JOIN users u ON u.id = e.commander_id
          WHERE e.status = ${status} AND e.is_rehearsal = ${isRehearsal}
          ORDER BY e.opened_at DESC LIMIT 50
        `
      : await sql`
          SELECT e.*, u.display_name as commander_name
          FROM recovery_events e
          LEFT JOIN users u ON u.id = e.commander_id
          WHERE e.is_rehearsal = ${isRehearsal}
          ORDER BY e.opened_at DESC LIMIT 50
        `;
    res.json({ data: events });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/events/:id', requireAuth, goldDataFilter, async (req: Request, res: Response) => {
  const [event] = await sql`
    SELECT e.*, u.display_name as commander_name
    FROM recovery_events e
    LEFT JOIN users u ON u.id = e.commander_id
    WHERE e.id = ${req.params.id}
  `;
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json({ data: event });
});

// ─── SOE & Steps ───────────────────────────────────────────────────────────
router.get('/events/:id/soe', requireAuth, requireTier('BRONZE', 'SILVER', 'AUTHOR', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const [soe] = await sql`SELECT * FROM soes WHERE event_id = ${req.params.id} ORDER BY created_at DESC LIMIT 1`;
    if (!soe) return res.status(404).json({ error: 'SOE not found' });

    const steps = await sql`
      SELECT s.*, u.display_name as assignee_name
      FROM soe_steps s
      LEFT JOIN users u ON u.id = s.assigned_to
      WHERE s.soe_id = ${soe.id}
      ORDER BY s.sequence
    `;

    const phases = await sql`SELECT * FROM soe_phases WHERE soe_id = ${soe.id} ORDER BY sequence`;
    res.json({ data: { ...soe, phases, steps } });
  } catch (err) { logger.error('SOE fetch error', { err: String(err) }); res.status(500).json({ error: String(err) }); }
});

router.get('/events/:id/gantt', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  try {
  const [soe] = await sql`SELECT * FROM soes WHERE event_id = ${req.params.id} ORDER BY created_at DESC LIMIT 1`;
  if (!soe) return res.status(404).json({ error: 'SOE not found' });

  const steps = await sql`
    SELECT s.*, u.display_name as assignee_name, p.name as phase_name
    FROM soe_steps s
    LEFT JOIN users u ON u.id = s.assigned_to
    LEFT JOIN soe_phases p ON p.id = s.phase_id
    WHERE s.soe_id = ${soe.id}
    ORDER BY s.sequence
  `;

  // Calculate Gantt timing from step durations and dependencies
  const ganttData = computeGanttLayout(steps);
  res.json({ data: { soe, gantt: ganttData } });
  } catch (err) { logger.error('Gantt error', { err: String(err) }); res.status(500).json({ error: String(err) }); }
});

function computeGanttLayout(steps: Array<Record<string, unknown>>) {
  const stepMap = new Map(steps.map(s => [s.id as string, s]));
  const startTimes = new Map<string, number>();

  // Topological sort to compute earliest start times
  function getStartTime(stepId: string): number {
    if (startTimes.has(stepId)) return startTimes.get(stepId)!;
    const step = stepMap.get(stepId);
    if (!step) return 0;
    const deps = (step.dependencies as string[]) || [];
    const depEnd = deps.reduce((max, depId) => {
      const depStart = getStartTime(depId);
      const depDuration = (stepMap.get(depId)?.ml_predicted_duration_minutes as number) || (stepMap.get(depId)?.estimated_duration_minutes as number) || 15;
      return Math.max(max, depStart + depDuration);
    }, 0);
    startTimes.set(stepId, depEnd);
    return depEnd;
  }

  return steps.map(step => {
    const startMinute = getStartTime(step.id as string);
    const duration = (step.ml_predicted_duration_minutes as number) || (step.estimated_duration_minutes as number) || 15;
    return {
      ...step,
      ganttStartMinute: startMinute,
      ganttEndMinute: startMinute + duration,
      duration,
    };
  });
}

router.patch('/events/:eventId/steps/:stepId', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'BLOCKED']).optional(),
    assignedTo: z.string().uuid().optional(),
    skippedReason: z.string().optional(),
    blockedReason: z.string().optional(),
  });
  const data = schema.parse(req.body);

  const [existing] = await sql`SELECT * FROM soe_steps WHERE id = ${req.params.stepId}`;
  if (!existing) return res.status(404).json({ error: 'Step not found' });

  const updates: Record<string, unknown> = {};
  if (data.status) {
    updates.status = data.status;
    if (data.status === 'IN_PROGRESS' && !existing.started_at) updates.started_at = new Date();
    if (data.status === 'COMPLETED') updates.completed_at = new Date();
  }
  if (data.assignedTo) updates.assigned_to = data.assignedTo;
  if (data.skippedReason) updates.skipped_reason = data.skippedReason;
  if (data.blockedReason) updates.blocked_reason = data.blockedReason;

  const [updated] = await sql`
    UPDATE soe_steps SET ${sql(updates)}, updated_at = NOW()
    WHERE id = ${req.params.stepId}
    RETURNING *
  `;

  await writeAuditEntry({ eventId: req.params.eventId, userId: req.user!.sub, userTier: req.user!.restore_tier, action: 'STEP_UPDATED', objectType: 'SOE_STEP', objectId: req.params.stepId, beforeState: existing, afterState: updated });

  // Enqueue TTFR recalculation
  if (data.status === 'COMPLETED') {
    await enqueueJob('recalculate_ttfr', { eventId: req.params.eventId, soeId: existing.soe_id });
  }

  res.json({ data: updated });
});

router.post('/events/:eventId/steps/:stepId/evidence', requireAuth, async (req: Request, res: Response) => {
  const schema = z.object({
    evidenceType: z.enum(['NOTE', 'LOG', 'SCREENSHOT', 'FILE']).default('NOTE'),
    title: z.string().optional(),
    content: z.string().optional(),
  });
  const data = schema.parse(req.body);

  const [evidence] = await sql`
    INSERT INTO evidence (step_id, event_id, uploaded_by, evidence_type, title, content)
    VALUES (${req.params.stepId}, ${req.params.eventId}, ${req.user!.sub}, ${data.evidenceType}, ${data.title ?? null}, ${data.content ?? null})
    RETURNING *
  `;

  await writeAuditEntry({ eventId: req.params.eventId, userId: req.user!.sub, userTier: req.user!.restore_tier, action: 'EVIDENCE_ADDED', objectType: 'EVIDENCE', objectId: evidence.id });
  res.status(201).json({ data: evidence });
});

// ─── Executive Dashboard ───────────────────────────────────────────────────
router.get('/dashboard/executive', requireAuth, requireTier('GOLD', 'ADMIN'), async (req: Request, res: Response) => {
  const [activeEvents] = await sql`SELECT COUNT(*) as count FROM recovery_events WHERE status IN ('OPEN','IN_PROGRESS') AND is_rehearsal = FALSE`;
  const services = await sql`SELECT * FROM business_services ORDER BY impact_tier, name`;
  const [avgMttr] = await sql`
    SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - opened_at))/60) as avg_mttr_minutes
    FROM recovery_events
    WHERE status = 'RESOLVED' AND resolved_at IS NOT NULL AND is_rehearsal = FALSE
    AND opened_at > NOW() - INTERVAL '90 days'
  `;

  res.json({
    data: {
      activeEventCount: parseInt(activeEvents.count),
      businessServices: services,
      avgMttrMinutes: Math.round(avgMttr?.avg_mttr_minutes ?? 0),
      generatedAt: new Date(),
    },
  });
});

// ─── Audit ─────────────────────────────────────────────────────────────────
router.get('/audit', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  try {
    const eventId    = req.query.eventId    as string | undefined;
    const filterUser = req.query.userId     as string | undefined;
    const from       = req.query.from       as string | undefined;
    const to         = req.query.to         as string | undefined;
    const limit      = parseInt((req.query.limit as string) || '50');

    // Build query dynamically to avoid postgres.js null type inference issues
    let entries;
    if (eventId) {
      entries = await sql`
        SELECT a.*, u.display_name as user_name FROM audit_log a
        LEFT JOIN users u ON u.id = a.user_id::uuid
        WHERE a.event_id = ${eventId}::uuid
        ORDER BY a.sequence DESC LIMIT ${limit}
      `;
    } else {
      entries = await sql`
        SELECT a.*, u.display_name as user_name FROM audit_log a
        LEFT JOIN users u ON u.id = a.user_id::uuid
        ORDER BY a.sequence DESC LIMIT ${limit}
      `;
    }
    res.json({ data: entries });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Rehearsals ────────────────────────────────────────────────────────────
router.post('/rehearsals', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  const schema = z.object({ name: z.string(), eventType: z.string(), scheduledAt: z.string().optional() });
  const data = schema.parse(req.body);

  const [rehearsal] = await sql`
    INSERT INTO rehearsals (name, event_type, scheduled_at, created_by, commander_id, status)
    VALUES (${data.name}, ${data.eventType}, ${data.scheduledAt ?? null}, ${req.user!.sub}, ${req.user!.sub}, 'SCHEDULED')
    RETURNING *
  `;
  await writeAuditEntry({ userId: req.user!.sub, userTier: req.user!.restore_tier, action: 'REHEARSAL_CREATED', objectType: 'REHEARSAL', objectId: rehearsal.id });
  res.status(201).json({ data: rehearsal });
});

router.post('/rehearsals/:id/start', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  const [rehearsal] = await sql`SELECT * FROM rehearsals WHERE id = ${req.params.id}`;
  if (!rehearsal) return res.status(404).json({ error: 'Rehearsal not found' });

  // Create a sandboxed recovery event
  const [event] = await sql`
    INSERT INTO recovery_events (title, event_type, severity, is_rehearsal, opened_by, commander_id)
    VALUES (${`[REHEARSAL] ${rehearsal.name}`}, ${rehearsal.event_type}, 'P2', TRUE, ${req.user!.sub}, ${req.user!.sub})
    RETURNING *
  `;

  await sql`
    UPDATE rehearsals SET status = 'IN_PROGRESS', started_at = NOW(), recovery_event_id = ${event.id}
    WHERE id = ${req.params.id}
  `;

  // Enqueue SOE generation for rehearsal
  await enqueueJob('generate_soe', {
    eventId: event.id,
    eventType: rehearsal.event_type,
    severity: 'P2',
    affectedServiceIds: [],
    isRehearsal: true,
  }, { priority: 2 });

  await writeAuditEntry({ eventId: event.id, userId: req.user!.sub, action: 'REHEARSAL_STARTED', isRehearsal: true });
  res.json({ data: { rehearsal, event } });
});

// ─── Runbook Connectors ────────────────────────────────────────────────────
router.get('/connectors', requireAuth, requireTier('AUTHOR', 'ADMIN'), async (req: Request, res: Response) => {
  const connectors = await sql`SELECT id, name, connector_type, config, last_synced_at, last_sync_status, is_active FROM connectors ORDER BY name`;
  res.json({ data: connectors });
});

router.post('/runbooks/ingest', requireAuth, requireTier('AUTHOR', 'ADMIN'), async (req: Request, res: Response) => {
  const { connectorId } = req.body;
  await enqueueJob('sync_connector', { connectorId }, { priority: 2 });
  res.json({ data: { message: 'Ingestion queued', connectorId } });
});

// ─── Health ────────────────────────────────────────────────────────────────
router.get('/health', async (_req: Request, res: Response) => {
  const { healthCheck } = await import('../lib/db');
  const dbOk = await healthCheck().catch(() => false);
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ok' : 'degraded', db: dbOk, ts: new Date() });
});

// ─── SOAR callback ─────────────────────────────────────────────────────────
router.post('/automation/callback/:stepId', requireAuth, async (req: Request, res: Response) => {
  const { stepId } = req.params;
  const { result, status } = req.body;

  const stepStatus = status === 'success' ? 'COMPLETED' : 'BLOCKED';
  await sql`
    UPDATE soe_steps SET status = ${stepStatus}, updated_at = NOW(),
    ${stepStatus === 'COMPLETED' ? sql`completed_at = NOW(),` : sql``}
    blocked_reason = ${status !== 'success' ? `SOAR callback: ${result}` : null}
    WHERE id = ${stepId}
  `;

  await writeAuditEntry({ action: 'AUTOMATION_CALLBACK', objectType: 'SOE_STEP', objectId: stepId, afterState: { result, status } });
  res.json({ data: { ok: true } });
});

// ── File upload ────────────────────────────────────────────────────────────
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/events/:eventId/steps/:stepId/evidence/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });
  const { storage, validateFile, generateStorageKey, scanFile } = await import('../storage/adapter');
  try {
    validateFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    const key = generateStorageKey(req.params.eventId, req.params.stepId, req.file.originalname);
    const scanResult = await scanFile(req.file.buffer, req.file.originalname);
    if (scanResult === 'QUARANTINED') return res.status(422).json({ error: 'File quarantined — potential threat detected' });
    const stored = await storage.put(key, req.file.buffer, req.file.mimetype);
    const [evidence] = await sql`
      INSERT INTO evidence (step_id, event_id, uploaded_by, evidence_type, title, storage_key, file_name, file_size, mime_type, scan_status)
      VALUES (${req.params.stepId}, ${req.params.eventId}, ${req.user!.sub}, 'FILE', ${req.file.originalname}, ${key}, ${req.file.originalname}, ${req.file.size}, ${req.file.mimetype}, 'CLEAN')
      RETURNING *
    `;
    await writeAuditEntry({ eventId: req.params.eventId, userId: req.user!.sub, userTier: req.user!.restore_tier, action: 'EVIDENCE_UPLOADED', objectType: 'EVIDENCE', objectId: evidence.id });
    res.status(201).json({ data: { ...evidence, url: stored.url } });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// ── Users (for assignment modal) ────────────────────────────────────────────
router.get('/users', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  const users = await sql`SELECT id, email, display_name, tier, roles FROM users WHERE is_active = TRUE ORDER BY display_name`;
  res.json({ data: users });
});

// ── Escalations ────────────────────────────────────────────────────────────
router.get('/events/:id/escalations', requireAuth, async (req: Request, res: Response) => {
  try {
    const escalations = await sql`
      SELECT esc.*, u.display_name as raised_by_name FROM escalations esc
      JOIN users u ON u.id = esc.raised_by
      WHERE esc.event_id = ${req.params.id} ORDER BY esc.created_at DESC
    `;
    res.json({ data: escalations });
  } catch (err) { logger.error('Escalations fetch error', { err: String(err) }); res.status(500).json({ error: String(err) }); }
});

router.post('/events/:id/escalations', requireAuth, async (req: Request, res: Response) => {
  const { stepId, severity, description } = req.body;
  if (!description) return res.status(400).json({ error: 'Description required' });
  const [esc] = await sql`
    INSERT INTO escalations (event_id, step_id, raised_by, severity, description)
    VALUES (${req.params.id}, ${stepId || null}, ${req.user!.sub}, ${severity || 'HIGH'}, ${description})
    RETURNING *
  `;
  await writeAuditEntry({ eventId: req.params.id, userId: req.user!.sub, userTier: req.user!.restore_tier, action: 'ESCALATION_RAISED', objectType: 'ESCALATION', objectId: esc.id });
  // Notify IC
  const { notifyEscalation } = await import('../modules/notifications/dispatcher');
  await notifyEscalation(esc.id).catch(() => {});
  res.status(201).json({ data: esc });
});

router.patch('/escalations/:id', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  const { status } = req.body;
  const [updated] = await sql`UPDATE escalations SET status = ${status}, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
  res.json({ data: updated });
});

// ── Event resolve ──────────────────────────────────────────────────────────
router.patch('/events/:id', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  const { status } = req.body;
  const updates: Record<string, unknown> = { status };
  if (status === 'RESOLVED') updates.resolved_at = new Date();
  if (status === 'CLOSED') updates.closed_at = new Date();
  const [event] = await sql`UPDATE recovery_events SET ${sql(updates)}, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
  await writeAuditEntry({ eventId: req.params.id, userId: req.user!.sub, userTier: req.user!.restore_tier, action: 'EVENT_STATUS_CHANGED', objectType: 'RECOVERY_EVENT', objectId: req.params.id, afterState: { status } });
  if (status === 'RESOLVED') {
    const [soe] = await sql`SELECT id FROM soes WHERE event_id = ${req.params.id} ORDER BY created_at DESC LIMIT 1`;
    if (soe) await enqueueJob('generate_report', { eventId: req.params.id, reportType: 'OPERATIONAL' });
  }
  res.json({ data: event });
});

// ── Asset dependencies (for graph view) ──────────────────────────────────
router.get('/assets/dependencies', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  const deps = await sql`SELECT source_asset_id as source, target_asset_id as target, relationship_type FROM asset_dependencies WHERE effective_to IS NULL`;
  res.json({ data: deps });
});

// ── Approve automated step ────────────────────────────────────────────────
router.post('/events/:eventId/steps/:stepId/approve', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  const [updated] = await sql`
    UPDATE soe_steps SET approved_by = ${req.user!.sub}, approved_at = NOW(), status = 'IN_PROGRESS' WHERE id = ${req.params.stepId} RETURNING *
  `;
  await writeAuditEntry({ eventId: req.params.eventId, userId: req.user!.sub, userTier: req.user!.restore_tier, action: 'STEP_APPROVED', objectType: 'SOE_STEP', objectId: req.params.stepId });
  res.json({ data: updated });
});

// ── Event report ──────────────────────────────────────────────────────────
router.get('/events/:id/report', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  const { generateOperationalReport, generateExecutiveReport } = await import('../modules/reporting/reportGenerator');
  const tier = req.user!.restore_tier;
  const report = tier === 'GOLD' || tier === 'ADMIN'
    ? await generateExecutiveReport(req.params.id)
    : await generateOperationalReport(req.params.id);
  res.json({ data: report });
});

// ── Business Services CRUD ─────────────────────────────────────────────────
router.post('/business-services', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  try {
    const { name, businessUnit, impactTier, rtoMinutes } = req.body;
    if (!name || !businessUnit) return res.status(400).json({ error: 'name and businessUnit required' });
    const [service] = await sql`
      INSERT INTO business_services (name, business_unit, impact_tier, rto_minutes)
      VALUES (${name}, ${businessUnit}, ${impactTier ?? 2}, ${rtoMinutes ?? 240})
      RETURNING *
    `;
    res.status(201).json({ data: service });
  } catch (err) { logger.error('Create service error', { err }); res.status(500).json({ error: String(err) }); }
});

router.patch('/business-services/:id', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  try {
    const { name, businessUnit, impactTier, rtoMinutes } = req.body;
    const updates: Record<string, unknown> = {};
    if (name) updates.name = name;
    if (businessUnit) updates.business_unit = businessUnit;
    if (impactTier) updates.impact_tier = impactTier;
    if (rtoMinutes) updates.rto_minutes = rtoMinutes;
    const [service] = await sql`UPDATE business_services SET ${sql(updates)}, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    res.json({ data: service });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete('/business-services/:id', requireAuth, requireMinTier('ADMIN'), async (req: Request, res: Response) => {
  try {
    await sql`DELETE FROM business_services WHERE id = ${req.params.id}`;
    res.json({ data: { ok: true } });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get('/business-services/:id/assets', requireAuth, async (req: Request, res: Response) => {
  try {
    const assets = await sql`SELECT a.* FROM assets a JOIN business_service_assets bsa ON bsa.asset_id = a.id WHERE bsa.business_service_id = ${req.params.id}`;
    res.json({ data: assets });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post('/business-services/:id/assets', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  try {
    const { assetId } = req.body;
    await sql`INSERT INTO business_service_assets (business_service_id, asset_id) VALUES (${req.params.id}, ${assetId}) ON CONFLICT DO NOTHING`;
    res.status(201).json({ data: { ok: true } });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete('/business-services/:id/assets/:assetId', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  try {
    await sql`DELETE FROM business_service_assets WHERE business_service_id = ${req.params.id} AND asset_id = ${req.params.assetId}`;
    res.json({ data: { ok: true } });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Asset CRUD ─────────────────────────────────────────────────────────────
router.patch('/assets/:id', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  try {
    const { name, assetType, environment, owner, criticalityTier, location, recoveryGroup } = req.body;
    const updates: Record<string, unknown> = {};
    if (name) updates.name = name;
    if (assetType) updates.asset_type = assetType;
    if (environment) updates.environment = environment;
    if (owner !== undefined) updates.owner = owner;
    if (criticalityTier) updates.criticality_tier = criticalityTier;
    if (location !== undefined) updates.location = location;
    if (recoveryGroup !== undefined) updates.recovery_group = recoveryGroup;
    const [asset] = await sql`UPDATE assets SET ${sql(updates)}, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    res.json({ data: asset });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete('/assets/:id', requireAuth, requireMinTier('ADMIN'), async (req: Request, res: Response) => {
  try {
    await sql`DELETE FROM assets WHERE id = ${req.params.id}`;
    res.json({ data: { ok: true } });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post('/assets/dependencies', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  try {
    const { sourceAssetId, targetAssetId, relationshipType } = req.body;
    await sql`INSERT INTO asset_dependencies (source_asset_id, target_asset_id, relationship_type) VALUES (${sourceAssetId}, ${targetAssetId}, ${relationshipType}) ON CONFLICT DO NOTHING`;
    res.status(201).json({ data: { ok: true } });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Connector CRUD ─────────────────────────────────────────────────────────
router.post('/connectors', requireAuth, requireTier('AUTHOR', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    const { name, connectorType, config, credentialRef, syncSchedule } = req.body;
    const [connector] = await sql`
      INSERT INTO connectors (name, connector_type, config, credential_ref, sync_schedule, created_by)
      VALUES (${name}, ${connectorType}, ${sql.json(config ?? {})}, ${credentialRef ?? null}, ${syncSchedule ?? '0 */6 * * *'}, ${req.user!.sub})
      RETURNING *
    `;
    res.status(201).json({ data: connector });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete('/connectors/:id', requireAuth, requireTier('AUTHOR', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    await sql`DELETE FROM connectors WHERE id = ${req.params.id}`;
    res.json({ data: { ok: true } });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Runbook routes ─────────────────────────────────────────────────────────
router.get('/runbooks', requireAuth, async (req: Request, res: Response) => {
  try {
    const runbooks = await sql`SELECT id, title, source_ref, content_hash, fetched_at, event_tags, service_tags, connector_id, content_text FROM runbooks ORDER BY fetched_at DESC LIMIT 200`;
    res.json({ data: runbooks });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.get('/runbooks/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const [runbook] = await sql`SELECT * FROM runbooks WHERE id = ${req.params.id}`;
    if (!runbook) return res.status(404).json({ error: 'Not found' });
    res.json({ data: runbook });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── SOE step direct edit routes ────────────────────────────────────────────
router.patch('/soe-steps/:id', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  try {
    const allowed = ['name','description','swim_lane','estimated_duration_minutes','step_type','is_on_critical_path','requires_approval','sequence'];
    const updates: Record<string, unknown> = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k.replace(/([A-Z])/g, '_$1').toLowerCase()] = req.body[k]; }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No valid fields' });
    const [step] = await sql`UPDATE soe_steps SET ${sql(updates)}, updated_at = NOW() WHERE id = ${req.params.id} RETURNING *`;
    res.json({ data: step });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.delete('/soe-steps/:id', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  try {
    await sql`DELETE FROM soe_steps WHERE id = ${req.params.id}`;
    res.json({ data: { ok: true } });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

router.post('/soes/:id/steps', requireAuth, requireMinTier('SILVER'), async (req: Request, res: Response) => {
  try {
    const { name, description, swimLane, estimatedDurationMinutes, stepType, isOnCriticalPath, requiresApproval, sequence } = req.body;
    const [step] = await sql`
      INSERT INTO soe_steps (soe_id, name, description, swim_lane, estimated_duration_minutes, step_type, is_on_critical_path, requires_approval, sequence)
      VALUES (${req.params.id}, ${name}, ${description ?? ''}, ${swimLane ?? 'General'}, ${estimatedDurationMinutes ?? 15}, ${stepType ?? 'HUMAN'}, ${isOnCriticalPath ?? false}, ${requiresApproval ?? false}, ${sequence ?? 999})
      RETURNING *
    `;
    res.status(201).json({ data: step });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── PDF runbook upload ─────────────────────────────────────────────────────
router.post('/runbooks/upload-pdf', requireAuth, requireTier('AUTHOR', 'ADMIN'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const { storage, generateStorageKey, extractPdfText } = await import('../storage/adapter');
    const key = generateStorageKey('pdf', 'manual', req.file.originalname);
    await storage.put(key, req.file.buffer, req.file.mimetype);

    // Get or create a PDF connector
    let [connector] = await sql`SELECT id FROM connectors WHERE connector_type = 'PDF' LIMIT 1`;
    if (!connector) {
      [connector] = await sql`INSERT INTO connectors (name, connector_type, config, created_by) VALUES ('PDF Uploads', 'PDF', '{}', ${req.user!.sub}) RETURNING id`;
    }

    // Queue PDF text extraction
    await enqueueJob('ingest_pdf', { storageKey: key, connectorId: connector.id, fileName: req.file.originalname }, { priority: 2 });
    res.status(202).json({ data: { message: 'PDF queued for ingestion', storageKey: key } });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ── Runbook tag update (for runbook-to-component association) ──────────────
router.patch('/runbooks/:id/tags', requireAuth, requireTier('AUTHOR', 'ADMIN', 'SILVER'), async (req: Request, res: Response) => {
  try {
    const { eventTags, serviceTags } = req.body;
    const [runbook] = await sql`SELECT * FROM runbooks WHERE id = ${req.params.id}`;
    if (!runbook) return res.status(404).json({ error: 'Runbook not found' });
    const newEventTags = [...new Set([...(runbook.event_tags || []), ...(eventTags || [])])];
    const newServiceTags = [...new Set([...(runbook.service_tags || []), ...(serviceTags || [])])];
    const [updated] = await sql`
      UPDATE runbooks SET event_tags = ${newEventTags}, service_tags = ${newServiceTags}, updated_at = NOW()
      WHERE id = ${req.params.id} RETURNING id, title, event_tags, service_tags
    `;
    res.json({ data: updated });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});
