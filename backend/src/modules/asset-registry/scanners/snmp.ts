import * as dgram from 'dgram';
import { logger } from '../../../lib/logger';

export interface SNMPResult {
  ip: string;
  responded: boolean;
  sysDescr?: string;
  sysObjectID?: string;
  sysUpTime?: number;
  sysContact?: string;
  sysName?: string;
  sysLocation?: string;
  interfaces?: SNMPInterface[];
}

export interface SNMPInterface {
  index: number;
  description: string;
  mac_address?: string;
  status: 'up' | 'down';
}

// Simple SNMP v1/v2c GET implementation using raw UDP
// For production use, consider the 'net-snmp' npm package
const SNMP_PORT = 161;
const COMMUNITY = 'public';

// Build a minimal SNMPv2c GET-REQUEST for sysDescr (OID 1.3.6.1.2.1.1.1.0)
function buildSnmpGetRequest(community: string, requestId: number): Buffer {
  // This is a simplified implementation — for full SNMP support install net-snmp
  // OID: 1.3.6.1.2.1.1.1.0 = sysDescr
  const oid = Buffer.from([0x06, 0x08, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00]);
  const nullVal = Buffer.from([0x05, 0x00]);
  const varbind = Buffer.concat([Buffer.from([0x30, oid.length + nullVal.length]), oid, nullVal]);
  const varbindList = Buffer.concat([Buffer.from([0x30, varbind.length]), varbind]);

  const communityBuf = Buffer.from(community, 'ascii');
  const communityField = Buffer.concat([Buffer.from([0x04, communityBuf.length]), communityBuf]);

  const reqIdBuf = Buffer.from([0x02, 0x04,
    (requestId >> 24) & 0xff, (requestId >> 16) & 0xff,
    (requestId >> 8) & 0xff, requestId & 0xff,
  ]);
  const errorStatus = Buffer.from([0x02, 0x01, 0x00]);
  const errorIndex = Buffer.from([0x02, 0x01, 0x00]);

  const pduPayload = Buffer.concat([reqIdBuf, errorStatus, errorIndex, varbindList]);
  const pdu = Buffer.concat([Buffer.from([0xa0, pduPayload.length]), pduPayload]);

  const version = Buffer.from([0x02, 0x01, 0x01]); // version 2c = 1
  const messagePayload = Buffer.concat([version, communityField, pdu]);
  return Buffer.concat([Buffer.from([0x30, messagePayload.length]), messagePayload]);
}

async function snmpProbe(ip: string, community = COMMUNITY, timeoutMs = 3000): Promise<SNMPResult> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const requestId = Math.floor(Math.random() * 0xffff);
    let resolved = false;

    const cleanup = (result: SNMPResult) => {
      if (resolved) return;
      resolved = true;
      socket.close();
      resolve(result);
    };

    const timer = setTimeout(() => {
      cleanup({ ip, responded: false });
    }, timeoutMs);

    socket.on('message', (msg) => {
      clearTimeout(timer);
      // Extract sysDescr string value from response (simplified)
      let sysDescr: string | undefined;
      try {
        // Find OctetString value in response
        const str = msg.toString('ascii').replace(/[^\x20-\x7E]+/g, ' ').trim();
        if (str.length > 5) sysDescr = str.substring(0, 200);
      } catch { /* ignore */ }
      cleanup({ ip, responded: true, sysDescr });
    });

    socket.on('error', () => cleanup({ ip, responded: false }));

    const packet = buildSnmpGetRequest(community, requestId);
    socket.send(packet, SNMP_PORT, ip, (err) => {
      if (err) cleanup({ ip, responded: false });
    });
  });
}

export async function snmpSweep(
  ips: string[],
  community = COMMUNITY,
  maxConcurrent = 20,
  onProgress?: (completed: number, total: number) => void
): Promise<SNMPResult[]> {
  const results: SNMPResult[] = [];
  let completed = 0;

  for (let i = 0; i < ips.length; i += maxConcurrent) {
    const batch = ips.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(async (ip) => {
        // Try v2c first, if no response try v1 (community 'public')
        let result = await snmpProbe(ip, community);
        if (!result.responded) {
          result = await snmpProbe(ip, 'public', 2000);
        }
        completed++;
        if (onProgress) onProgress(completed, ips.length);
        return result;
      })
    );
    results.push(...batchResults);
  }

  return results;
}
