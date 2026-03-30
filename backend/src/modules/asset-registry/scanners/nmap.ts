import { execFile } from 'child_process';
import { promisify } from 'util';
import { parseStringPromise } from 'xml2js';
import { logger } from '../../../lib/logger';

const execFileAsync = promisify(execFile);

export interface NmapPortResult {
  port: number;
  protocol: string;
  state: string;
  service?: string;
  product?: string;
  version?: string;
  extrainfo?: string;
}

export interface NmapOSMatch {
  name: string;
  accuracy: number;
  vendor?: string;
  family?: string;
}

export interface NmapScriptOutput {
  http_title?: string;
  ssl_cert_subject?: string;
  ssl_cert_expiry?: string;
  ssl_cert_issuer?: string;
  smb_os?: string;
  smb_domain?: string;
}

export interface NmapHostResult {
  ip: string;
  hostname?: string;
  mac_address?: string;
  mac_vendor?: string;
  status: 'up' | 'down';
  ports: NmapPortResult[];
  os_matches: NmapOSMatch[];
  best_os?: NmapOSMatch;
  scripts: NmapScriptOutput;
}

let nmapAvailable: boolean | null = null;

export async function checkNmapAvailable(): Promise<boolean> {
  if (nmapAvailable !== null) return nmapAvailable;
  try {
    await execFileAsync('nmap', ['--version'], { timeout: 5000 });
    nmapAvailable = true;
  } catch {
    nmapAvailable = false;
    logger.warn('Nmap not found — Nmap scan type disabled');
  }
  return nmapAvailable;
}

function getTimingFlag(timing: string): string {
  switch (timing) {
    case 'Slow': return '-T2';
    case 'Fast': return '-T4';
    default: return '-T3';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractScripts(scriptList: any[]): NmapScriptOutput {
  const output: NmapScriptOutput = {};
  if (!Array.isArray(scriptList)) return output;

  for (const script of scriptList) {
    const id = script?.$?.id;
    const out = script?.$?.output || '';

    if (id === 'http-title') {
      output.http_title = out.replace(/\s+/g, ' ').trim().substring(0, 200);
    }
    if (id === 'ssl-cert') {
      const subjMatch = out.match(/Subject: ([^\n]+)/);
      const issuerMatch = out.match(/Issuer: ([^\n]+)/);
      const expiryMatch = out.match(/Not valid after:\s+([^\n]+)/);
      if (subjMatch) output.ssl_cert_subject = subjMatch[1].trim();
      if (issuerMatch) output.ssl_cert_issuer = issuerMatch[1].trim();
      if (expiryMatch) output.ssl_cert_expiry = expiryMatch[1].trim();
    }
    if (id === 'smb-os-discovery') {
      const osMatch = out.match(/OS: ([^\n]+)/);
      const domainMatch = out.match(/Domain: ([^\n]+)/);
      if (osMatch) output.smb_os = osMatch[1].trim();
      if (domainMatch) output.smb_domain = domainMatch[1].trim();
    }
  }
  return output;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseNmapXml(xml: any): NmapHostResult[] {
  const results: NmapHostResult[] = [];
  const hosts = xml?.nmaprun?.host || [];
  const hostList = Array.isArray(hosts) ? hosts : [hosts];

  for (const host of hostList) {
    if (!host) continue;
    const statusEl = host.status?.[0]?.$;
    const status = statusEl?.state || 'down';

    const addresses = host.address || [];
    let ip = '';
    let mac = '';
    let macVendor = '';
    for (const addr of addresses) {
      const a = addr.$;
      if (a.addrtype === 'ipv4' || a.addrtype === 'ipv6') ip = a.addr;
      if (a.addrtype === 'mac') { mac = a.addr; macVendor = a.vendor || ''; }
    }

    const hostname = host.hostnames?.[0]?.hostname?.[0]?.$?.name;

    const ports: NmapPortResult[] = [];
    const portList = host.ports?.[0]?.port || [];
    const portArray = Array.isArray(portList) ? portList : [portList];
    for (const p of portArray) {
      if (!p?.$) continue;
      const portState = p.state?.[0]?.$?.state;
      if (portState === 'open') {
        const svc = p.service?.[0]?.$;
        ports.push({
          port: parseInt(p.$.portid),
          protocol: p.$.protocol,
          state: portState,
          service: svc?.name,
          product: svc?.product,
          version: svc?.version,
          extrainfo: svc?.extrainfo,
        });
      }
    }

    const os_matches: NmapOSMatch[] = [];
    const osMatches = host.os?.[0]?.osmatch || [];
    const osMatchArr = Array.isArray(osMatches) ? osMatches : [osMatches];
    for (const om of osMatchArr) {
      const accuracy = parseInt(om?.$?.accuracy || '0');
      if (accuracy >= 85) {
        const osClass = om.osclass?.[0]?.$;
        os_matches.push({
          name: om?.$?.name || '',
          accuracy,
          vendor: osClass?.vendor,
          family: osClass?.osfamily,
        });
      }
    }

    const scripts = extractScripts(host.hostscript?.[0]?.script || []);

    results.push({
      ip,
      hostname,
      mac_address: mac || undefined,
      mac_vendor: macVendor || undefined,
      status: status as 'up' | 'down',
      ports,
      os_matches,
      best_os: os_matches.length > 0 ? os_matches[0] : undefined,
      scripts,
    });
  }

  return results;
}

export async function nmapScan(
  targets: string[],
  timing: string = 'Normal',
  extraFlags: string[] = []
): Promise<NmapHostResult[]> {
  if (!(await checkNmapAvailable())) {
    throw new Error('Nmap is not installed or not in PATH');
  }

  const timingFlag = getTimingFlag(timing);
  const targetStr = targets.join(' ');

  const args = [
    timingFlag,
    ...extraFlags,
    '-sV', '--version-intensity', '5',
    '-O',
    '--script=banner,http-title,ssl-cert,smb-os-discovery',
    '-oX', '-',
    targetStr,
  ];

  logger.info('Running nmap', { args: args.join(' ') });

  try {
    const { stdout } = await execFileAsync('nmap', args, {
      timeout: 10 * 60 * 1000, // 10 minute hard timeout
      maxBuffer: 50 * 1024 * 1024, // 50MB
    });

    const parsed = await parseStringPromise(stdout);
    return parseNmapXml(parsed);
  } catch (err) {
    logger.error('Nmap execution failed', { err: String(err) });
    throw err;
  }
}
