#!/usr/bin/env node
/**
 * IT Asset Registry — Remote Agent
 *
 * Deploy this on any trusted machine that has network access to the segment
 * you want to discover. It polls the cloud for scan jobs, runs them locally
 * using the same scanner modules, and submits results back over HTTPS.
 *
 * Supports full offline operation: results are buffered to SQLite and flushed
 * when connectivity to the cloud is restored.
 *
 * Configuration (environment variables or agent.config.json):
 *   AGENT_ID          - Your agent ID from the cloud registration
 *   AGENT_API_KEY     - The API key from registration (keep secret)
 *   CLOUD_URL         - Base URL of your cloud instance, e.g. https://restore.yourco.com
 *   AGENT_SITE        - Human-readable site name shown in the UI
 *   AGENT_NETWORK     - CIDR to scan by default, e.g. 192.168.1.0/24
 *   HEARTBEAT_INTERVAL_MS  - How often to ping cloud (default 30000)
 *   POLL_INTERVAL_MS       - How often to poll for new jobs (default 10000)
 *   PASSIVE_ENABLED        - Enable passive PCAP discovery (default false)
 *   LOG_LEVEL              - debug | info | warn | error (default info)
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import Database from 'better-sqlite3';

// ─── Scanner imports (reuse existing scanner modules) ─────────────────────────
// These are the same files built for the backend — copy them alongside the agent
// or point to the shared package if you extract them to a monorepo package.
import { icmpSweep } from './scanners/icmp';
import { tcpScan, getPortList } from './scanners/tcp';
import { nmapScan, checkNmapAvailable } from './scanners/nmap';
import { snmpSweep } from './scanners/snmp';
import { httpCheck } from './scanners/http';
import { expandIPRange, expandCIDR } from './scanners/ip-utils';
import { matchResultToAssets, calculateConfidenceScore, resolveHostname } from './scanners/result-processor';

// ─── Config ───────────────────────────────────────────────────────────────────

function loadConfig() {
  // Try to load from agent.config.json next to the binary
  const configPath = path.join(process.cwd(), 'agent.config.json');
  let fileConfig: Record<string, string> = {};
  if (fs.existsSync(configPath)) {
    try { fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch {}
  }

  const get = (key: string, fallback = '') =>
    process.env[key] ?? fileConfig[key] ?? fallback;

  return {
    agentId:           get('AGENT_ID'),
    apiKey:            get('AGENT_API_KEY'),
    cloudUrl:          get('CLOUD_URL', 'http://localhost:3001'),
    siteName:          get('AGENT_SITE', os.hostname()),
    networkCidr:       get('AGENT_NETWORK', ''),
    heartbeatMs:       parseInt(get('HEARTBEAT_INTERVAL_MS', '30000')),
    pollMs:            parseInt(get('POLL_INTERVAL_MS', '10000')),
    passiveEnabled:    get('PASSIVE_ENABLED', 'false') === 'true',
    logLevel:          get('LOG_LEVEL', 'info'),
    bufferDbPath:      get('BUFFER_DB', path.join(process.cwd(), 'agent-buffer.db')),
    version:           '1.0.0',
  };
}

const config = loadConfig();

if (!config.agentId || !config.apiKey || !config.cloudUrl) {
  console.error('[AGENT] Missing required config: AGENT_ID, AGENT_API_KEY, CLOUD_URL');
  process.exit(1);
}

// ─── Logger ───────────────────────────────────────────────────────────────────

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const minLevel = LEVELS[config.logLevel] ?? 1;

const log = {
  debug: (msg: string, data?: any) => minLevel <= 0 && console.debug(`[DEBUG] ${msg}`, data ?? ''),
  info:  (msg: string, data?: any) => minLevel <= 1 && console.info( `[INFO]  ${msg}`, data ?? ''),
  warn:  (msg: string, data?: any) => minLevel <= 2 && console.warn( `[WARN]  ${msg}`, data ?? ''),
  error: (msg: string, data?: any) => minLevel <= 3 && console.error(`[ERROR] ${msg}`, data ?? ''),
};

// ─── Offline Buffer (SQLite) ──────────────────────────────────────────────────

const db = new Database(config.bufferDbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS buffer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    payload TEXT NOT NULL,
    flushed INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS discovery_buffer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now')),
    payload TEXT NOT NULL,
    flushed INTEGER DEFAULT 0
  );
`);

function bufferResults(jobId: string, results: any[], summary: any) {
  const stmt = db.prepare('INSERT INTO buffer (job_id, payload) VALUES (?, ?)');
  stmt.run(jobId, JSON.stringify({ job_id: jobId, results, summary }));
  log.info(`Buffered ${results.length} results for job ${jobId} (offline)`);
}

function bufferDiscovery(assets: any[]) {
  const stmt = db.prepare('INSERT INTO discovery_buffer (payload) VALUES (?)');
  stmt.run(JSON.stringify({ assets }));
  log.info(`Buffered ${assets.length} discovery entries (offline)`);
}

async function flushBuffer(client: AxiosInstance): Promise<void> {
  const rows = db.prepare('SELECT * FROM buffer WHERE flushed = 0 ORDER BY id ASC LIMIT 20').all() as any[];
  if (!rows.length) return;

  log.info(`Flushing ${rows.length} buffered result batches to cloud...`);
  try {
    const batches = rows.map(r => JSON.parse(r.payload));
    await client.post('/agent/buffer', { batches });
    const ids = rows.map(r => r.id);
    db.prepare(`UPDATE buffer SET flushed = 1 WHERE id IN (${ids.join(',')})`).run();
    log.info(`Flushed ${rows.length} batches successfully`);
  } catch (err) {
    log.warn('Could not flush buffer — will retry', String(err));
  }

  // Flush discovery buffer
  const dRows = db.prepare('SELECT * FROM discovery_buffer WHERE flushed = 0 ORDER BY id ASC LIMIT 20').all() as any[];
  if (dRows.length) {
    try {
      for (const row of dRows as any[]) {
        const { assets } = JSON.parse(row.payload);
        await client.post('/agent/discovery', { assets });
        db.prepare('UPDATE discovery_buffer SET flushed = 1 WHERE id = ?').run(row.id);
      }
    } catch {}
  }
}

// ─── Cloud Client ─────────────────────────────────────────────────────────────

function createCloudClient(): AxiosInstance {
  return axios.create({
    baseURL: `${config.cloudUrl}/api/v1`,
    headers: { 'X-Agent-Key': config.apiKey, 'Content-Type': 'application/json' },
    timeout: 30000,
  });
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

let currentJobId: string | null = null;
let isOnline = false;

async function sendHeartbeat(client: AxiosInstance): Promise<any | null> {
  try {
    const resp = await client.post('/agent/heartbeat', {
      version: config.version,
      status: currentJobId ? 'running' : 'idle',
      current_job_id: currentJobId,
      metrics: {
        platform: os.platform(),
        arch: os.arch(),
        uptime_s: Math.floor(process.uptime()),
        mem_free_mb: Math.floor(os.freemem() / 1024 / 1024),
        load_avg: os.loadavg()[0].toFixed(2),
      },
    });

    if (!isOnline) {
      log.info('Cloud connection restored — flushing offline buffer');
      isOnline = true;
      await flushBuffer(client);
    }

    return resp.data?.pending_job ?? null;
  } catch (err) {
    if (isOnline) {
      log.warn('Lost cloud connection — switching to offline mode');
      isOnline = false;
    }
    return null;
  }
}

// ─── Scan Execution ───────────────────────────────────────────────────────────

async function expandTargets(targetType: string, targetSpec: any): Promise<string[]> {
  if (targetType === 'SINGLE_IP')   return [targetSpec.value];
  if (targetType === 'IP_RANGE')    return expandIPRange(targetSpec.value);
  if (targetType === 'CIDR')        return expandCIDR(targetSpec.value);
  if (targetType === 'ALL_ACTIVE' && config.networkCidr) return expandCIDR(config.networkCidr);
  return [];
}

async function executeJob(client: AxiosInstance, job: any): Promise<void> {
  const { job_id, scan_id, payload } = job;
  const { scan_type, target_type, target_spec, port_config, timing = 'Normal' } = payload;

  log.info(`Starting job ${job_id} — type: ${scan_type}, target: ${target_type}`);
  currentJobId = job_id;

  try {
    // Signal start
    await client.post(`/agent/jobs/${job_id}/start`).catch(() => {});

    const ips = await expandTargets(target_type, target_spec);
    if (!ips.length) {
      log.warn(`No IPs to scan for job ${job_id}`);
      currentJobId = null;
      return;
    }

    log.info(`Scanning ${ips.length} hosts`);
    const results: any[] = [];
    let hostsUp = 0, hostsDown = 0, newDiscovered = 0;

    // ── ICMP ──────────────────────────────────────────────────────────────────
    if (scan_type === 'ICMP' || scan_type === 'FULL_DISCOVERY') {
      const icmpResults = await icmpSweep(ips, 50);
      for (const r of icmpResults) {
        const hostname = r.responded ? await resolveHostname(r.ip) : undefined;
        const confidence = calculateConfidenceScore({ icmpResponded: r.responded, dnsResolved: !!hostname });
        results.push({ ip: r.ip, hostname, status: r.status, latency_ms: r.avg_latency_ms,
          ttl: r.ttl, ttl_hint: r.ttl_hint, confidence_score: confidence, is_new_discovery: true });
        if (r.responded) hostsUp++; else hostsDown++;
      }
    }

    // ── TCP ───────────────────────────────────────────────────────────────────
    if (scan_type === 'TCP' || scan_type === 'FULL_DISCOVERY') {
      const ports = getPortList(port_config?.preset ?? 'top20', port_config?.custom_ports);
      const scanTargets = scan_type === 'FULL_DISCOVERY'
        ? results.filter(r => r.status === 'Online').map(r => r.ip)
        : ips;
      for (const ip of scanTargets) {
        const tcpResult = await tcpScan(ip, ports, 20);
        const existing = results.find(r => r.ip === ip);
        const portData = { open_ports: tcpResult.open_ports };
        if (existing) Object.assign(existing, portData);
        else results.push({ ip, status: 'Online', ...portData, confidence_score: 20, is_new_discovery: true });
      }
    }

    // ── NMAP ──────────────────────────────────────────────────────────────────
    if (scan_type === 'NMAP') {
      if (!(await checkNmapAvailable())) {
        log.warn('Nmap not installed — skipping Nmap scan on this agent');
      } else {
        const nmapResults = await nmapScan(ips, timing);
        for (const r of nmapResults) {
          const confidence = calculateConfidenceScore({
            icmpResponded: r.status === 'up', tcpPortsOpen: r.ports.length > 0, nmapOsMatch: !!r.best_os,
          });
          results.push({ ip: r.ip, hostname: r.hostname, mac_address: r.mac_address,
            status: r.status === 'up' ? 'Online' : 'Offline', open_ports: r.ports,
            os_fingerprint: r.best_os, confidence_score: confidence, is_new_discovery: true });
          if (r.status === 'up') hostsUp++; else hostsDown++;
        }
      }
    }

    // ── SNMP ──────────────────────────────────────────────────────────────────
    if (scan_type === 'SNMP') {
      const snmpResults = await snmpSweep(ips);
      for (const r of snmpResults) {
        results.push({ ip: r.ip, hostname: r.sysName, status: r.responded ? 'Online' : 'Offline',
          snmp_sysname: r.sysName, snmp_sysdescr: r.sysDescr,
          confidence_score: calculateConfidenceScore({ snmpResponded: r.responded }), is_new_discovery: true });
        if (r.responded) hostsUp++; else hostsDown++;
      }
    }

    // ── HTTP ──────────────────────────────────────────────────────────────────
    if (scan_type === 'HTTP') {
      for (const ip of ips) {
        const r = await httpCheck(ip, 80, false);
        results.push({ ip, status: r.status_category === 'Healthy' ? 'Online' : 'Offline',
          http_status_code: r.status_code, http_response_time_ms: r.response_time_ms,
          page_title: r.page_title, server_header: r.server_header,
          confidence_score: 20, is_new_discovery: true });
      }
    }

    const summary = { hosts_scanned: ips.length, hosts_up: hostsUp || results.filter(r => r.status === 'Online').length,
      hosts_down: hostsDown || results.filter(r => r.status !== 'Online').length, new_discovered: newDiscovered };

    log.info(`Job ${job_id} complete — ${results.length} results`);

    // Submit results (or buffer if offline)
    if (isOnline) {
      try {
        await client.post(`/agent/jobs/${job_id}/results`, { results, summary, status: 'Complete' });
        log.info(`Results submitted for job ${job_id}`);
      } catch (err) {
        log.warn(`Could not submit results — buffering locally`, String(err));
        bufferResults(job_id, results, summary);
      }
    } else {
      bufferResults(job_id, results, summary);
    }
  } catch (err) {
    log.error(`Job ${job_id} failed`, String(err));
    await client.post(`/agent/jobs/${job_id}/results`, {
      results: [], summary: {}, status: 'Failed', error_message: String(err),
    }).catch(() => {});
  } finally {
    currentJobId = null;
  }
}

// ─── Passive Discovery (PCAP) ─────────────────────────────────────────────────

async function startPassiveDiscovery(client: AxiosInstance) {
  // Passive discovery requires libpcap and elevated privileges.
  // This stub implements the reporting side — the actual capture
  // integrates with pcap-node or a sniffer subprocess.
  log.info('Passive discovery enabled — watching for ARP / DNS / DHCP traffic');

  // In a full implementation this would:
  //   1. Open a pcap capture on the default interface
  //   2. Parse ARP, mDNS, NBNS, DHCP packets
  //   3. Build a rolling map of IP→MAC→hostname sightings
  //   4. Every 5 minutes, POST new discoveries to /agent/discovery

  // Stub: emit a test discovery every 5 minutes if enabled
  setInterval(async () => {
    const discovered: any[] = [
      // Real entries populated by pcap parser
    ];
    if (!discovered.length) return;

    if (isOnline) {
      await client.post('/agent/discovery', { assets: discovered }).catch(() => {
        bufferDiscovery(discovered);
      });
    } else {
      bufferDiscovery(discovered);
    }
  }, 5 * 60 * 1000);
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

async function main() {
  const client = createCloudClient();

  log.info('Agent starting', {
    agentId: config.agentId, cloudUrl: config.cloudUrl,
    site: config.siteName, version: config.version,
  });

  // Initial heartbeat
  const pendingJob = await sendHeartbeat(client);
  if (pendingJob) {
    await executeJob(client, pendingJob);
  }

  if (config.passiveEnabled) {
    startPassiveDiscovery(client);
  }

  // Heartbeat loop
  setInterval(async () => {
    const job = await sendHeartbeat(client);
    if (job && !currentJobId) {
      executeJob(client, job);
    }
  }, config.heartbeatMs);

  // Job poll loop (more frequent than heartbeat)
  setInterval(async () => {
    if (currentJobId || !isOnline) return;
    try {
      const resp = await client.get('/agent/jobs');
      const jobs: any[] = resp.data?.data ?? [];
      if (jobs.length && !currentJobId) {
        await executeJob(client, jobs[0]);
      }
    } catch {}
  }, config.pollMs);

  log.info('Agent running — press Ctrl+C to stop');
}

main().catch(err => {
  console.error('[AGENT] Fatal error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT',  () => { log.info('Agent shutting down'); db.close(); process.exit(0); });
process.on('SIGTERM', () => { log.info('Agent shutting down'); db.close(); process.exit(0); });
