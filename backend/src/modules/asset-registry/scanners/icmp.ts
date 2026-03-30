import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../../lib/logger';

const execAsync = promisify(exec);

export interface ICMPResult {
  ip: string;
  responded: boolean;
  avg_latency_ms?: number;
  packet_loss_pct: number;
  ttl?: number;
  ttl_hint?: string;
  status: 'Online' | 'Offline' | 'Filtered';
}

function getTTLHint(ttl: number): string {
  if (ttl <= 64) return 'Linux/macOS';
  if (ttl <= 128) return 'Windows';
  if (ttl <= 255) return 'Network Device';
  return 'Unknown';
}

async function pingHost(ip: string, timeout = 1): Promise<ICMPResult> {
  try {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows
      ? `ping -n 3 -w ${timeout * 1000} ${ip}`
      : `ping -c 3 -W ${timeout} -q ${ip}`;

    const { stdout } = await execAsync(cmd, { timeout: (timeout + 1) * 3000 });

    if (isWindows) {
      const responded = !stdout.includes('Request timed out') && !stdout.includes('Destination host unreachable');
      const latencyMatch = stdout.match(/Average = (\d+)ms/);
      const lossMatch = stdout.match(/\((\d+)% loss\)/);
      const ttlMatch = stdout.match(/TTL=(\d+)/);
      const ttl = ttlMatch ? parseInt(ttlMatch[1]) : undefined;
      return {
        ip,
        responded,
        avg_latency_ms: latencyMatch ? parseInt(latencyMatch[1]) : undefined,
        packet_loss_pct: lossMatch ? parseInt(lossMatch[1]) : 100,
        ttl,
        ttl_hint: ttl ? getTTLHint(ttl) : undefined,
        status: responded ? 'Online' : 'Offline',
      };
    } else {
      const responded = stdout.includes(' 0% packet loss') || stdout.includes('0% packet loss');
      const lossMatch = stdout.match(/(\d+)% packet loss/);
      const latencyMatch = stdout.match(/rtt min\/avg\/max\/mdev = [\d.]+\/([\d.]+)\//);
      const ttlMatch = stdout.match(/ttl=(\d+)/i);
      const ttl = ttlMatch ? parseInt(ttlMatch[1]) : undefined;
      const loss = lossMatch ? parseInt(lossMatch[1]) : 100;
      return {
        ip,
        responded,
        avg_latency_ms: latencyMatch ? parseFloat(latencyMatch[1]) : undefined,
        packet_loss_pct: loss,
        ttl,
        ttl_hint: ttl ? getTTLHint(ttl) : undefined,
        status: responded ? 'Online' : loss === 100 ? 'Offline' : 'Filtered',
      };
    }
  } catch {
    return { ip, responded: false, packet_loss_pct: 100, status: 'Offline' };
  }
}

export async function icmpSweep(
  ips: string[],
  maxConcurrent = 50,
  onProgress?: (completed: number, total: number, current: string) => void
): Promise<ICMPResult[]> {
  const results: ICMPResult[] = [];
  let completed = 0;

  for (let i = 0; i < ips.length; i += maxConcurrent) {
    const batch = ips.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(async (ip) => {
        const result = await pingHost(ip);
        completed++;
        if (onProgress) onProgress(completed, ips.length, ip);
        return result;
      })
    );
    results.push(...batchResults);
    logger.debug(`ICMP sweep batch complete: ${completed}/${ips.length}`);
  }

  return results;
}
