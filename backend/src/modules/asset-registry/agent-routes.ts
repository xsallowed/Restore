import { Router, Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { sql, writeAuditEntry } from '../../lib/db';
import { requireAuth, requireMinTier } from '../../middleware/auth';
import { logger } from '../../lib/logger';

export const agentRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function generateApiKey(): { raw: string; hashed: string; prefix: string } {
  const raw = `agt_${randomBytes(32).toString('hex')}`;
  return { raw, hashed: hashApiKey(raw), prefix: raw.substring(0, 12) };
}

/** Middleware: authenticate an agent using X-Agent-Key header */
function requireAgentAuth(req: Request, res: Response, next: Function) {
  const agentKey = req.headers['x-agent-key'] as string | undefined;
  if (!agentKey) {
    return res.status(401).json({ success: false, error: 'Missing X-Agent-Key header' });
  }
  (req as any).agentKey = agentKey;
  (req as any).agentKeyHashed = hashApiKey(agentKey);
  next();
}

// ─── CLOUD→AGENT MANAGEMENT (requires user JWT) ──────────────────────────────

/**
 * POST /api/v1/agents
 * Register a new agent and return a one-time API key.
 * The raw key is shown ONCE — the cloud stores only the hash.
 */
agentRouter.post(
  '/agents',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        site_name: z.string().min(1),
        description: z.string().optional(),
        network_cidr: z.string().optional(),
      });
      const body = schema.parse(req.body);
      const { raw, hashed, prefix } = generateApiKey();
      const agentId = `AGT-${Date.now()}-${randomBytes(4).toString('hex')}`;

      await sql`
        INSERT INTO agents (agent_id, name, site_name, description, api_key, api_key_prefix, network_cidr, status, created_by)
        VALUES (${agentId}, ${body.name}, ${body.site_name}, ${body.description ?? null},
                ${hashed}, ${prefix}, ${body.network_cidr ?? null}, 'Pending', ${req.user!.sub})
      `;

      await writeAuditEntry({
        action: 'CREATE', entity_type: 'AGENT', entity_id: agentId,
        changes: { name: body.name, site_name: body.site_name }, user_id: req.user!.sub,
      });

      logger.info('Agent registered', { agentId, name: body.name });

      // Raw key shown ONCE — never returned again
      res.status(201).json({
        success: true,
        data: {
          agent_id: agentId,
          name: body.name,
          site_name: body.site_name,
          api_key: raw,           // SHOW TO USER ONCE ONLY
          api_key_prefix: prefix,
          warning: 'Save this API key — it will not be shown again.',
        },
      });
    } catch (err) {
      logger.error('POST /agents error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/agents
 * List all agents (never returns raw API keys)
 */
agentRouter.get(
  '/agents',
  requireAuth,
  requireMinTier('SILVER'),
  async (_req: Request, res: Response) => {
    try {
      const agents = await sql`
        SELECT agent_id, name, site_name, description, api_key_prefix, status,
               version, os_info, ip_address, network_cidr, capabilities,
               last_heartbeat_at, last_job_at, created_at
        FROM agents ORDER BY created_at DESC
      `;
      res.json({ success: true, data: agents });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/agents/:id
 * Get single agent with recent job history
 */
agentRouter.get(
  '/agents/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const agents = await sql`
        SELECT agent_id, name, site_name, description, api_key_prefix, status,
               version, os_info, ip_address, network_cidr, capabilities,
               last_heartbeat_at, last_job_at, created_at
        FROM agents WHERE agent_id = ${req.params.id}
      `;
      if (!agents.length) return res.status(404).json({ success: false, error: 'Agent not found' });

      const jobs = await sql`
        SELECT job_id, job_type, status, queued_at, completed_at, result_summary, error_message
        FROM agent_jobs WHERE agent_id = ${req.params.id}
        ORDER BY queued_at DESC LIMIT 20
      `;

      const heartbeats = await sql`
        SELECT received_at, ip_address, version, status, metrics
        FROM agent_heartbeats WHERE agent_id = ${req.params.id}
        ORDER BY received_at DESC LIMIT 10
      `;

      res.json({ success: true, data: { ...agents[0], recent_jobs: jobs, recent_heartbeats: heartbeats } });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/v1/agents/:id
 * Deregister an agent
 */
agentRouter.delete(
  '/agents/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      await sql`DELETE FROM agents WHERE agent_id = ${req.params.id}`;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/agents/:id/rotate-key
 * Rotate the API key for an agent — returns new raw key once
 */
agentRouter.post(
  '/agents/:id/rotate-key',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { raw, hashed, prefix } = generateApiKey();
      await sql`
        UPDATE agents SET api_key = ${hashed}, api_key_prefix = ${prefix}, updated_at = NOW()
        WHERE agent_id = ${req.params.id}
      `;
      res.json({
        success: true,
        data: { api_key: raw, api_key_prefix: prefix, warning: 'Update the agent config with this new key.' },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/agents/:id/dispatch
 * Dispatch a scan job to a specific agent
 */
agentRouter.post(
  '/agents/:id/dispatch',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { scan_id, job_type = 'active_scan', payload } = req.body;
      const jobId = `JOB-${Date.now()}-${randomBytes(4).toString('hex')}`;

      // If scan_id provided, mark it as agent-routed
      if (scan_id) {
        await sql`UPDATE scans SET agent_id = ${req.params.id} WHERE scan_id = ${scan_id}`;
      }

      await sql`
        INSERT INTO agent_jobs (job_id, agent_id, scan_id, job_type, status, payload, created_by)
        VALUES (${jobId}, ${req.params.id}, ${scan_id ?? null}, ${job_type},
                'Queued', ${sql.json(payload ?? {})}, ${req.user!.sub})
      `;

      res.status(201).json({ success: true, data: { job_id: jobId, status: 'Queued' } });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── AGENT→CLOUD PROTOCOL (requires X-Agent-Key) ─────────────────────────────

/**
 * POST /api/v1/agent/heartbeat
 * Agent pings every 30s. Updates last_heartbeat_at and logs metrics.
 */
agentRouter.post(
  '/agent/heartbeat',
  requireAgentAuth,
  async (req: Request, res: Response) => {
    try {
      const keyHashed = (req as any).agentKeyHashed;
      const agents = await sql`SELECT agent_id FROM agents WHERE api_key = ${keyHashed} AND status != 'Disabled'`;
      if (!agents.length) return res.status(401).json({ success: false, error: 'Unknown or disabled agent' });

      const agentId = agents[0].agent_id;
      const { version, status = 'idle', current_job_id, metrics } = req.body;
      const ip = (req.ip || '').replace('::ffff:', '');

      await sql`
        UPDATE agents SET
          last_heartbeat_at = NOW(), version = ${version ?? null},
          ip_address = ${ip || null}, status = 'Active', updated_at = NOW()
        WHERE agent_id = ${agentId}
      `;

      await sql`
        INSERT INTO agent_heartbeats (agent_id, ip_address, version, status, current_job_id, metrics)
        VALUES (${agentId}, ${ip || null}, ${version ?? null}, ${status},
                ${current_job_id ?? null}, ${metrics ? sql.json(metrics) : null})
      `;

      // Return any pending jobs for this agent
      const pendingJobs = await sql`
        SELECT job_id, job_type, payload FROM agent_jobs
        WHERE agent_id = ${agentId} AND status = 'Queued'
        ORDER BY queued_at ASC LIMIT 1
      `;

      if (pendingJobs.length) {
        await sql`UPDATE agent_jobs SET status = 'Dispatched', dispatched_at = NOW() WHERE job_id = ${pendingJobs[0].job_id}`;
      }

      res.json({ success: true, pending_job: pendingJobs[0] ?? null });
    } catch (err) {
      logger.error('POST /agent/heartbeat error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/agent/jobs
 * Agent polls for its next job
 */
agentRouter.get(
  '/agent/jobs',
  requireAgentAuth,
  async (req: Request, res: Response) => {
    try {
      const keyHashed = (req as any).agentKeyHashed;
      const agents = await sql`SELECT agent_id FROM agents WHERE api_key = ${keyHashed} AND status != 'Disabled'`;
      if (!agents.length) return res.status(401).json({ success: false, error: 'Unknown agent' });

      const agentId = agents[0].agent_id;

      const jobs = await sql`
        SELECT job_id, job_type, scan_id, payload FROM agent_jobs
        WHERE agent_id = ${agentId} AND status IN ('Queued', 'Dispatched')
        ORDER BY queued_at ASC LIMIT 5
      `;

      res.json({ success: true, data: jobs });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/agent/jobs/:jobId/start
 * Agent signals it has started a job
 */
agentRouter.post(
  '/agent/jobs/:jobId/start',
  requireAgentAuth,
  async (req: Request, res: Response) => {
    try {
      const keyHashed = (req as any).agentKeyHashed;
      const agents = await sql`SELECT agent_id FROM agents WHERE api_key = ${keyHashed}`;
      if (!agents.length) return res.status(401).json({ success: false, error: 'Unknown agent' });

      await sql`
        UPDATE agent_jobs SET status = 'Running', started_at = NOW()
        WHERE job_id = ${req.params.jobId} AND agent_id = ${agents[0].agent_id}
      `;

      // Also update the linked scan
      await sql`
        UPDATE scans SET status = 'Running', started_at = NOW()
        WHERE scan_id = (SELECT scan_id FROM agent_jobs WHERE job_id = ${req.params.jobId})
      `;

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/agent/jobs/:jobId/results
 * Agent submits scan results (supports batched / offline-buffered submissions)
 */
agentRouter.post(
  '/agent/jobs/:jobId/results',
  requireAgentAuth,
  async (req: Request, res: Response) => {
    try {
      const keyHashed = (req as any).agentKeyHashed;
      const agents = await sql`SELECT agent_id FROM agents WHERE api_key = ${keyHashed}`;
      if (!agents.length) return res.status(401).json({ success: false, error: 'Unknown agent' });

      const agentId = agents[0].agent_id;
      const { results, summary, status = 'Complete', error_message } = req.body;

      // Validate job belongs to this agent
      const jobs = await sql`
        SELECT job_id, scan_id FROM agent_jobs WHERE job_id = ${req.params.jobId} AND agent_id = ${agentId}
      `;
      if (!jobs.length) return res.status(404).json({ success: false, error: 'Job not found' });

      const { scan_id } = jobs[0];

      // Write results into scan_results table (same schema as direct scans)
      if (Array.isArray(results)) {
        for (const r of results) {
          const resultId = `RES-${Date.now()}-${randomBytes(3).toString('hex')}`;
          await sql`
            INSERT INTO scan_results (
              result_id, scan_id, target_ip, hostname, mac_address, status,
              latency_ms, open_ports, os_fingerprint, confidence_score,
              matched_asset_id, is_new_discovery
            ) VALUES (
              ${resultId}, ${scan_id ?? req.params.jobId},
              ${r.ip}::inet, ${r.hostname ?? null}, ${r.mac_address ?? null},
              ${r.status ?? 'Online'}, ${r.latency_ms ?? null},
              ${r.open_ports ? sql.json(r.open_ports) : null},
              ${r.os_fingerprint ? sql.json(r.os_fingerprint) : null},
              ${r.confidence_score ?? 0},
              ${r.matched_asset_id ?? null}, ${r.is_new_discovery ?? false}
            ) ON CONFLICT (result_id) DO NOTHING
          `.catch(() => {});
        }
      }

      // Update job status
      await sql`
        UPDATE agent_jobs SET status = ${status}, completed_at = NOW(),
          result_summary = ${summary ? sql.json(summary) : null},
          error_message = ${error_message ?? null}
        WHERE job_id = ${req.params.jobId}
      `;

      // Update linked scan
      if (scan_id) {
        await sql`
          UPDATE scans SET status = ${status}, completed_at = NOW(),
            hosts_up = ${summary?.hosts_up ?? 0}, hosts_down = ${summary?.hosts_down ?? 0},
            new_discovered = ${summary?.new_discovered ?? 0}
          WHERE scan_id = ${scan_id}
        `.catch(() => {});
      }

      // Update agent last_job_at
      await sql`UPDATE agents SET last_job_at = NOW() WHERE agent_id = ${agentId}`;

      logger.info('Agent job results received', { agentId, jobId: req.params.jobId, resultCount: results?.length ?? 0 });
      res.json({ success: true, processed: results?.length ?? 0 });
    } catch (err) {
      logger.error('POST /agent/jobs/:jobId/results error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/agent/buffer
 * Agent flushes its offline buffer when it reconnects.
 * Accepts an array of buffered result batches from multiple jobs.
 */
agentRouter.post(
  '/agent/buffer',
  requireAgentAuth,
  async (req: Request, res: Response) => {
    try {
      const keyHashed = (req as any).agentKeyHashed;
      const agents = await sql`SELECT agent_id FROM agents WHERE api_key = ${keyHashed}`;
      if (!agents.length) return res.status(401).json({ success: false, error: 'Unknown agent' });

      const agentId = agents[0].agent_id;
      const { batches } = req.body; // array of { job_id, results, summary }

      if (!Array.isArray(batches)) {
        return res.status(400).json({ success: false, error: 'batches must be an array' });
      }

      let totalProcessed = 0;
      for (const batch of batches) {
        const bufferId = `BUF-${Date.now()}-${randomBytes(3).toString('hex')}`;
        await sql`
          INSERT INTO agent_result_buffer (buffer_id, agent_id, job_id, result_data)
          VALUES (${bufferId}, ${agentId}, ${batch.job_id ?? null}, ${sql.json(batch)})
        `;
        totalProcessed++;
      }

      // Process buffer async — don't block the response
      setImmediate(() => processAgentBuffer(agentId));

      logger.info('Agent offline buffer received', { agentId, batches: totalProcessed });
      res.json({ success: true, batches_received: totalProcessed });
    } catch (err) {
      logger.error('POST /agent/buffer error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/agent/discovery
 * Agent submits passively discovered assets (PCAP / ARP / mDNS / DHCP)
 */
agentRouter.post(
  '/agent/discovery',
  requireAgentAuth,
  async (req: Request, res: Response) => {
    try {
      const keyHashed = (req as any).agentKeyHashed;
      const agents = await sql`
        SELECT agent_id, site_name FROM agents WHERE api_key = ${keyHashed}
      `;
      if (!agents.length) return res.status(401).json({ success: false, error: 'Unknown agent' });

      const { agent_id, site_name } = agents[0];
      const { assets } = req.body; // array of { ip, mac, hostname, evidence_source, evidence_details, confidence_score }

      if (!Array.isArray(assets)) {
        return res.status(400).json({ success: false, error: 'assets must be an array' });
      }

      let added = 0;
      for (const asset of assets) {
        const inboxId = `DISC-${Date.now()}-${randomBytes(3).toString('hex')}`;
        await sql`
          INSERT INTO discovery_inbox (
            id, hostname, ip_addresses, mac_addresses,
            evidence_source, evidence_details, confidence_score, last_seen, status
          ) VALUES (
            ${inboxId},
            ${asset.hostname ?? null},
            ARRAY[${asset.ip}]::inet[],
            ${asset.mac ? sql`ARRAY[${asset.mac}]::macaddr[]` : sql`'{}'::macaddr[]`},
            ${`agent:${site_name}:${asset.evidence_source ?? 'passive'}`},
            ${sql.json({ agent_id, site_name, ...(asset.evidence_details ?? {}) })},
            ${asset.confidence_score ?? 30},
            NOW(), 'Pending'
          ) ON CONFLICT DO NOTHING
        `.catch(() => {});
        added++;
      }

      res.json({ success: true, added });
    } catch (err) {
      logger.error('POST /agent/discovery error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── Buffer Processor ──────────────────────────────────────────────────────

async function processAgentBuffer(agentId: string) {
  try {
    const pending = await sql`
      SELECT * FROM agent_result_buffer
      WHERE agent_id = ${agentId} AND processed = FALSE
      ORDER BY submitted_at ASC LIMIT 50
    `;

    for (const row of pending) {
      try {
        const batch = row.result_data as any;
        if (batch.results && Array.isArray(batch.results)) {
          for (const r of batch.results) {
            const resultId = `RES-${Date.now()}-${randomBytes(3).toString('hex')}`;
            await sql`
              INSERT INTO scan_results (result_id, scan_id, target_ip, hostname, mac_address, status, latency_ms, confidence_score, is_new_discovery)
              VALUES (${resultId}, ${batch.job_id ?? 'buffered'}, ${r.ip}::inet,
                      ${r.hostname ?? null}, ${r.mac_address ?? null}, ${r.status ?? 'Online'},
                      ${r.latency_ms ?? null}, ${r.confidence_score ?? 0}, ${r.is_new_discovery ?? false})
              ON CONFLICT DO NOTHING
            `.catch(() => {});
          }
        }
        await sql`UPDATE agent_result_buffer SET processed = TRUE, processed_at = NOW() WHERE id = ${row.id}`;
      } catch (e) {
        await sql`UPDATE agent_result_buffer SET error = ${String(e)} WHERE id = ${row.id}`;
      }
    }
  } catch (err) {
    logger.error('processAgentBuffer error', { err: String(err) });
  }
}
