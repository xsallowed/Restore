import { logger } from '../../../lib/logger';

export interface MatchedAsset {
  asset_id: string;
  hostname?: string;
  primary_ip_address?: string;
  mac_addresses?: string[];
}

export interface ProcessedResult {
  result_id: string;
  target_ip: string;
  hostname?: string;
  mac_address?: string;
  status: string;
  matched_asset_id?: string;
  is_new_discovery: boolean;
  confidence_score: number;
  evidence: string[];
}

function normalizeMac(mac: string): string {
  return mac.replace(/[^a-fA-F0-9]/g, '').toLowerCase();
}

export function matchResultToAssets(
  targetIp: string,
  hostname: string | undefined,
  macAddress: string | undefined,
  assets: MatchedAsset[]
): string | undefined {
  // Priority 1: MAC address exact match
  if (macAddress) {
    const normalizedMac = normalizeMac(macAddress);
    for (const asset of assets) {
      if (asset.mac_addresses?.some((m) => normalizeMac(m) === normalizedMac)) {
        return asset.asset_id;
      }
    }
  }

  // Priority 2: IP address exact match
  for (const asset of assets) {
    if (asset.primary_ip_address === targetIp) {
      return asset.asset_id;
    }
  }

  // Priority 3: hostname match (case-insensitive)
  if (hostname) {
    const lowerHostname = hostname.toLowerCase();
    for (const asset of assets) {
      if (asset.hostname?.toLowerCase() === lowerHostname) {
        return asset.asset_id;
      }
    }
  }

  return undefined;
}

export function calculateConfidenceScore(evidence: {
  icmpResponded?: boolean;
  tcpPortsOpen?: boolean;
  nmapOsMatch?: boolean;
  snmpResponded?: boolean;
  dnsResolved?: boolean;
}): number {
  let score = 0;
  const reasons: string[] = [];

  if (evidence.icmpResponded) { score += 20; reasons.push('ICMP responded'); }
  if (evidence.tcpPortsOpen) { score += 20; reasons.push('TCP ports open'); }
  if (evidence.nmapOsMatch) { score += 25; reasons.push('Nmap OS match >85%'); }
  if (evidence.snmpResponded) { score += 20; reasons.push('SNMP responded'); }
  if (evidence.dnsResolved) { score += 15; reasons.push('Hostname resolved via DNS'); }

  return Math.min(score, 100);
}

export async function resolveHostname(ip: string): Promise<string | undefined> {
  try {
    const { promises: dns } = await import('dns');
    const result = await dns.reverse(ip);
    return result[0];
  } catch {
    return undefined;
  }
}

export function buildDiscoveryInboxEntry(result: {
  ip: string;
  hostname?: string;
  mac?: string;
  scanId: string;
  scanType: string;
  confidence: number;
}) {
  return {
    hostname: result.hostname,
    ip_addresses: [result.ip],
    mac_addresses: result.mac ? [result.mac] : [],
    evidence_source: `scan:${result.scanType}`,
    evidence_details: {
      scan_id: result.scanId,
      scan_type: result.scanType,
      discovered_at: new Date().toISOString(),
    },
    confidence_score: result.confidence,
    last_seen: new Date().toISOString(),
    status: 'Pending',
  };
}
