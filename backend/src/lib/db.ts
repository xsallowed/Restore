import postgres from 'postgres';
import { logger } from './logger';

const connectionString = process.env.DATABASE_URL || 'postgresql://restore:restore_dev_secret@localhost:5432/restore';

// Main query client
export const sql = postgres(connectionString, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 30,
  onnotice: (notice) => logger.debug('PG notice', { notice }),
});

// Dedicated connection for LISTEN/NOTIFY (cannot share with query pool)
let notifyClient: postgres.Sql | null = null;
const listeners: Map<string, Set<(payload: string) => void>> = new Map();

export async function startListening() {
  notifyClient = postgres(connectionString, { max: 1 });

  const channels = ['step_changed', 'asset_health_changed'];
  for (const channel of channels) {
    await notifyClient.listen(channel, (payload) => {
      const fns = listeners.get(channel);
      if (fns) fns.forEach(fn => fn(payload));
    });
    logger.info(`Listening on PG channel: ${channel}`);
  }
}

export function onNotify(channel: string, fn: (payload: string) => void) {
  if (!listeners.has(channel)) listeners.set(channel, new Set());
  listeners.get(channel)!.add(fn);
  return () => listeners.get(channel)?.delete(fn);
}

// Job enqueue helper
export async function enqueueJob(
  jobType: string,
  payload: Record<string, unknown>,
  options: { priority?: number; runAt?: Date; maxAttempts?: number } = {}
) {
  const [job] = await sql`
    INSERT INTO jobs (job_type, payload, priority, run_at, max_attempts)
    VALUES (
      ${jobType},
      ${sql.json(payload)},
      ${options.priority ?? 5},
      ${options.runAt ?? new Date()},
      ${options.maxAttempts ?? 3}
    )
    RETURNING id
  `;
  return job.id as string;
}

// Audit log helper — enforces HMAC chain
import { createHmac } from 'crypto';
const HMAC_SECRET = process.env.HMAC_SECRET || 'dev_hmac_secret';

export async function writeAuditEntry(entry: {
  eventId?: string;
  userId?: string;
  userTier?: string;
  action: string;
  objectType?: string;
  objectId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string;
  userAgent?: string;
  isRehearsal?: boolean;
}) {
  // Get the last hash in the chain
  const [last] = await sql`
    SELECT entry_hash FROM audit_log ORDER BY sequence DESC LIMIT 1
  `;
  const previousHash = last?.entry_hash ?? 'GENESIS';

  const content = JSON.stringify({ ...entry, previousHash, ts: new Date().toISOString() });
  const entryHash = createHmac('sha256', HMAC_SECRET).update(content).digest('hex');

  await sql`
    INSERT INTO audit_log (
      event_id, user_id, user_tier, action, object_type, object_id,
      before_state, after_state, ip_address, user_agent,
      previous_hash, entry_hash, is_rehearsal
    ) VALUES (
      ${entry.eventId ?? null}, ${entry.userId ?? null}, ${entry.userTier ?? null},
      ${entry.action}, ${entry.objectType ?? null}, ${entry.objectId ?? null},
      ${entry.beforeState ? sql.json(entry.beforeState as Record<string, unknown>) : null},
      ${entry.afterState ? sql.json(entry.afterState as Record<string, unknown>) : null},
      ${entry.ipAddress ?? null}, ${entry.userAgent ?? null},
      ${previousHash}, ${entryHash}, ${entry.isRehearsal ?? false}
    )
  `;

  return entryHash;
}

export async function healthCheck() {
  const [row] = await sql`SELECT 1 AS ok`;
  return row.ok === 1;
}
