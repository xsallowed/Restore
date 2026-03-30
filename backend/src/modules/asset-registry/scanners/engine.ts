import { logger } from '../../../lib/logger';
import { icmpSweep } from './icmp';
import { tcpScan, getPortList } from './tcp';
import { nmapScan, checkNmapAvailable } from './nmap';
import { snmpSweep } from './snmp';
import { httpCheck } from './http';
import { expandIPRange, expandCIDR } from './ip-utils';
import { matchResultToAssets, calculateConfidenceScore, resolveHostname, buildDiscoveryInboxEntry } from './result-processor';

interface ScanEngineConfig {
  sql: any; // postgres.js instance
}

let sqlInstance: any;

export function initScanEngine(config: ScanEngineConfig) {
  sqlInstance = config.sql;
}

async function logProgress(scanId: string, message: string, status = 'Info', hostsCompleted?: number, hostsTotal?: number, currentHost?: string) {
  try {
    const logId = `LOG-${Date.now()}-${Math.random().toString(36).substring(5)}`;
    await sqlInstance`
      INSERT INTO scan_progress_log (log_id, scan_id, message, status, hosts_completed, hosts_total, current_host)
      VALUES (${logId}, ${scanId}, ${message}, ${status}, ${hostsCompleted ?? null}, ${hostsTotal ?? null}, ${currentHost ?? null})
    `;
  } catch (err) {
    logger.error('Failed to log scan progress', { err: String(err) });
  }
}

async function expandTargets(targetType: string, targetSpec: any): Promise<string[]> {
  switch (targetType) {
    case 'SINGLE_IP':
      return [targetSpec.value];
    case 'IP_RANGE':
      return expandIPRange(targetSpec.value);
    case 'CIDR':
      return expandCIDR(targetSpec.value);
    case 'ASSET_GROUP': {
      const groups = await sqlInstance`SELECT asset_ids FROM asset_groups WHERE group_id = ${targetSpec.asset_group_id}`;
      if (!groups.length) return [];
      const assetIds = groups[0].asset_ids || [];
      const assets = await sqlInstance`SELECT primary_ip_address FROM assets WHERE asset_id = ANY(${assetIds}) AND primary_ip_address IS NOT NULL`;
      return assets.map((a: any) => a.primary_ip_address);
    }
    case 'ALL_ACTIVE': {
      const assets = await sqlInstance`SELECT primary_ip_address FROM assets WHERE status = 'Active' AND primary_ip_address IS NOT NULL`;
      return assets.map((a: any) => a.primary_ip_address);
    }
    default:
      return [];
  }
}

async function saveResult(scanId: string, result: any) {
  const resultId = `RES-${Date.now()}-${Math.random().toString(36).substring(5)}`;
  try {
    await sqlInstance`
      INSERT INTO scan_results (
        result_id, scan_id, target_ip, hostname, mac_address, status,
        latency_ms, packet_loss_pct, ttl, ttl_hint,
        open_ports, closed_ports, filtered_ports,
        os_fingerprint, services, confidence_score,
        ssl_cert_info, http_status_code, http_response_time_ms,
        page_title, server_header,
        snmp_sysname, snmp_sysdescr,
        matched_asset_id, is_new_discovery
      ) VALUES (
        ${resultId}, ${scanId}, ${result.ip}, ${result.hostname ?? null},
        ${result.mac_address ?? null}, ${result.status},
        ${result.latency_ms ?? null}, ${result.packet_loss_pct ?? null},
        ${result.ttl ?? null}, ${result.ttl_hint ?? null},
        ${result.open_ports ? sqlInstance.json(result.open_ports) : null},
        ${result.closed_ports ? sqlInstance.json(result.closed_ports) : null},
        ${result.filtered_ports ? sqlInstance.json(result.filtered_ports) : null},
        ${result.os_fingerprint ? sqlInstance.json(result.os_fingerprint) : null},
        ${result.services ? sqlInstance.json(result.services) : null},
        ${result.confidence_score ?? 0},
        ${result.ssl_cert_info ? sqlInstance.json(result.ssl_cert_info) : null},
        ${result.http_status_code ?? null},
        ${result.http_response_time_ms ?? null},
        ${result.page_title ?? null},
        ${result.server_header ?? null},
        ${result.snmp_sysname ?? null},
        ${result.snmp_sysdescr ?? null},
        ${result.matched_asset_id ?? null},
        ${result.is_new_discovery ?? false}
      )
      ON CONFLICT (result_id) DO NOTHING
    `;
  } catch (err) {
    logger.error('Failed to save scan result', { err: String(err), resultId });
  }
}

export async function executeScan(scanId: string): Promise<void> {
  logger.info(`Starting scan execution: ${scanId}`);

  // Fetch scan config
  const scans = await sqlInstance`SELECT * FROM scans WHERE scan_id = ${scanId}`;
  if (!scans.length) { logger.error(`Scan not found: ${scanId}`); return; }
  const scan = scans[0];

  const postScanActions = typeof scan.post_scan_actions === 'string'
    ? JSON.parse(scan.post_scan_actions) : scan.post_scan_actions;
  const targetSpec = typeof scan.target_spec === 'string'
    ? JSON.parse(scan.target_spec) : scan.target_spec;
  const portConfig = scan.port_config
    ? (typeof scan.port_config === 'string' ? JSON.parse(scan.port_config) : scan.port_config)
    : null;

  // Fetch existing assets for matching
  const existingAssets = await sqlInstance`
    SELECT asset_id, hostname, primary_ip_address, mac_addresses FROM assets
  `;

  try {
    await sqlInstance`UPDATE scans SET status = 'Running', started_at = NOW() WHERE scan_id = ${scanId}`;
    await logProgress(scanId, 'Scan started');

    const ips = await expandTargets(scan.target_type, targetSpec);
    await sqlInstance`UPDATE scans SET total_hosts = ${ips.length} WHERE scan_id = ${scanId}`;
    await logProgress(scanId, `Expanded targets: ${ips.length} hosts to scan`, 'Info', 0, ips.length);

    let hostsUp = 0;
    let hostsDown = 0;
    let newDiscovered = 0;

    if (scan.scan_type === 'ICMP' || scan.scan_type === 'FULL_DISCOVERY') {
      await logProgress(scanId, 'Running ICMP ping sweep...');
      const icmpResults = await icmpSweep(ips, 50, async (completed, total, current) => {
        if (completed % 10 === 0) {
          await logProgress(scanId, `Ping sweep: ${completed}/${total}`, 'Info', completed, total, current);
        }
      });

      for (const r of icmpResults) {
        const hostname = r.status === 'Online' ? await resolveHostname(r.ip) : undefined;
        const matchedId = matchResultToAssets(r.ip, hostname, undefined, existingAssets);
        const confidence = calculateConfidenceScore({
          icmpResponded: r.responded,
          dnsResolved: !!hostname,
        });
        const isNew = !matchedId && r.status === 'Online';

        if (r.status === 'Online') hostsUp++;
        else hostsDown++;
        if (isNew) newDiscovered++;

        await saveResult(scanId, {
          ...r, hostname, matched_asset_id: matchedId, is_new_discovery: isNew,
          confidence_score: confidence, status: r.status,
        });

        if (isNew && postScanActions?.add_to_discovery_inbox) {
          const entry = buildDiscoveryInboxEntry({ ip: r.ip, hostname, scanId, scanType: scan.scan_type, confidence });
          const inboxId = `DISC-${Date.now()}-${Math.random().toString(36).substring(5)}`;
          await sqlInstance`
            INSERT INTO discovery_inbox (id, hostname, ip_addresses, mac_addresses, evidence_source, evidence_details, confidence_score, last_seen, status)
            VALUES (${inboxId}, ${entry.hostname ?? null}, ARRAY[${r.ip}]::inet[], '{}', ${entry.evidence_source},
              ${sqlInstance.json(entry.evidence_details)}, ${confidence}, NOW(), 'Pending')
            ON CONFLICT DO NOTHING
          `.catch(() => {});
        }

        if (matchedId && postScanActions?.update_existing_assets) {
          await sqlInstance`
            UPDATE assets SET last_seen = NOW(), verification_status = ${r.status === 'Online' ? 'Online' : 'Offline'},
              confidence_score = GREATEST(confidence_score, ${confidence}), updated_at = NOW()
            WHERE asset_id = ${matchedId}
          `.catch(() => {});
        }

        if (!matchedId && r.status === 'Online' && postScanActions?.create_new_assets) {
          const newAssetId = `ASSET-${Date.now()}-${Math.random().toString(36).substring(5)}`;
          await sqlInstance`
            INSERT INTO assets (asset_id, hostname, primary_ip_address, status, discovery_source, confidence_score, created_by, updated_by)
            VALUES (${newAssetId}, ${hostname ?? r.ip}, ${r.ip}::inet, 'Discovered', ${`scan:${scan.scan_type}`}, ${confidence}, ${scan.created_by}, ${scan.created_by})
            ON CONFLICT DO NOTHING
          `.catch(() => {});
        }
      }
    }

    if (scan.scan_type === 'TCP' || scan.scan_type === 'FULL_DISCOVERY') {
      const ports = getPortList(portConfig?.preset ?? 'top20', portConfig?.custom_ports);
      await logProgress(scanId, `Running TCP port scan on ${ports.length} ports...`);

      const onlineIps = scan.scan_type === 'FULL_DISCOVERY'
        ? (await sqlInstance`SELECT DISTINCT target_ip FROM scan_results WHERE scan_id = ${scanId} AND status = 'Online'`).map((r: any) => r.target_ip)
        : ips;

      for (const ip of onlineIps) {
        const result = await tcpScan(ip, ports, 20, 2000);
        const existingResult = await sqlInstance`SELECT result_id FROM scan_results WHERE scan_id = ${scanId} AND target_ip = ${ip}::inet LIMIT 1`;

        if (existingResult.length > 0) {
          await sqlInstance`
            UPDATE scan_results SET
              open_ports = ${sqlInstance.json(result.open_ports)},
              closed_ports = ${sqlInstance.json(result.closed_ports)},
              filtered_ports = ${sqlInstance.json(result.filtered_ports)}
            WHERE scan_id = ${scanId} AND target_ip = ${ip}::inet
          `.catch(() => {});
        } else {
          const matchedId = matchResultToAssets(ip, undefined, undefined, existingAssets);
          await saveResult(scanId, {
            ip, status: 'Online', open_ports: result.open_ports,
            closed_ports: result.closed_ports, filtered_ports: result.filtered_ports,
            matched_asset_id: matchedId, is_new_discovery: !matchedId,
            confidence_score: calculateConfidenceScore({ tcpPortsOpen: result.open_ports.length > 0 }),
          });
        }
      }
    }

    if (scan.scan_type === 'NMAP') {
      if (!(await checkNmapAvailable())) {
        await logProgress(scanId, 'Nmap not installed — skipping Nmap scan', 'Warning');
      } else {
        await logProgress(scanId, 'Running Nmap OS & service detection...');
        const nmapResults = await nmapScan(ips, scan.timing);
        for (const r of nmapResults) {
          const matchedId = matchResultToAssets(r.ip, r.hostname, r.mac_address, existingAssets);
          const confidence = calculateConfidenceScore({
            icmpResponded: r.status === 'up',
            tcpPortsOpen: r.ports.length > 0,
            nmapOsMatch: !!r.best_os,
            dnsResolved: !!r.hostname,
          });
          await saveResult(scanId, {
            ip: r.ip, hostname: r.hostname, mac_address: r.mac_address,
            status: r.status === 'up' ? 'Online' : 'Offline',
            open_ports: r.ports, os_fingerprint: r.best_os,
            ssl_cert_info: r.scripts.ssl_cert_subject ? {
              subject: r.scripts.ssl_cert_subject,
              issuer: r.scripts.ssl_cert_issuer,
              expiry: r.scripts.ssl_cert_expiry,
            } : null,
            matched_asset_id: matchedId, is_new_discovery: !matchedId,
            confidence_score: confidence,
          });
          if (r.status === 'up') hostsUp++; else hostsDown++;
          if (!matchedId) newDiscovered++;
        }
      }
    }

    if (scan.scan_type === 'SNMP') {
      await logProgress(scanId, 'Running SNMP poll...');
      const snmpResults = await snmpSweep(ips, 'public', 20, async (completed, total) => {
        if (completed % 10 === 0) await logProgress(scanId, `SNMP: ${completed}/${total}`, 'Info', completed, total);
      });
      for (const r of snmpResults) {
        const matchedId = matchResultToAssets(r.ip, r.sysName, undefined, existingAssets);
        const confidence = calculateConfidenceScore({ snmpResponded: r.responded });
        await saveResult(scanId, {
          ip: r.ip, hostname: r.sysName, status: r.responded ? 'Online' : 'Offline',
          snmp_sysname: r.sysName, snmp_sysdescr: r.sysDescr,
          matched_asset_id: matchedId, is_new_discovery: !matchedId,
          confidence_score: confidence,
        });
        if (r.responded) hostsUp++; else hostsDown++;
      }
    }

    if (scan.scan_type === 'HTTP') {
      await logProgress(scanId, 'Running HTTP/HTTPS health checks...');
      for (const ip of ips) {
        const result = await httpCheck(ip, 80, false);
        const httpsResult = await httpCheck(ip, 443, true);
        const best = result.status_code ? result : httpsResult;
        const matchedId = matchResultToAssets(ip, undefined, undefined, existingAssets);
        await saveResult(scanId, {
          ip, status: best.status_category === 'Healthy' || best.status_category === 'Redirect' ? 'Online' : 'Offline',
          http_status_code: best.status_code, http_response_time_ms: best.response_time_ms,
          page_title: best.page_title, server_header: best.server_header,
          ssl_cert_info: best.ssl_cert_subject ? {
            subject: best.ssl_cert_subject, issuer: best.ssl_cert_issuer, expiry: best.ssl_cert_expiry,
          } : null,
          matched_asset_id: matchedId, is_new_discovery: !matchedId, confidence_score: 20,
        });
        if (best.status_category !== 'Unreachable') hostsUp++; else hostsDown++;
      }
    }

    // Finalize scan
    await sqlInstance`
      UPDATE scans SET
        status = 'Complete', completed_at = NOW(),
        hosts_up = ${hostsUp}, hosts_down = ${hostsDown}, new_discovered = ${newDiscovered}
      WHERE scan_id = ${scanId}
    `;
    await logProgress(scanId, `Scan complete. ${hostsUp} online, ${hostsDown} offline, ${newDiscovered} new discovered.`, 'Info', ips.length, ips.length);

    logger.info(`Scan ${scanId} completed: ${hostsUp} up, ${hostsDown} down, ${newDiscovered} new`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Scan ${scanId} failed`, { err: msg });
    await sqlInstance`UPDATE scans SET status = 'Failed', error_message = ${msg}, completed_at = NOW() WHERE scan_id = ${scanId}`.catch(() => {});
    await logProgress(scanId, `Scan failed: ${msg}`, 'Error');
  }
}
