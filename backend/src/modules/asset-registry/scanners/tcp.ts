import * as net from 'net';
import { logger } from '../../../lib/logger';

export interface PortResult {
  port: number;
  state: 'Open' | 'Closed' | 'Filtered';
  service?: string;
  banner?: string;
}

export interface TCPScanResult {
  ip: string;
  open_ports: PortResult[];
  closed_ports: number[];
  filtered_ports: number[];
}

const SERVICE_MAP: Record<number, string> = {
  21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
  80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 445: 'SMB',
  993: 'IMAPS', 995: 'POP3S', 1433: 'MSSQL', 1521: 'Oracle',
  3306: 'MySQL', 3389: 'RDP', 5432: 'PostgreSQL', 5900: 'VNC',
  6379: 'Redis', 8080: 'HTTP-Alt', 8443: 'HTTPS-Alt',
  9200: 'Elasticsearch', 27017: 'MongoDB', 5985: 'WinRM',
};

async function checkPort(ip: string, port: number, timeoutMs = 2000): Promise<PortResult> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let banner = '';
    let resolved = false;

    const cleanup = (state: 'Open' | 'Closed' | 'Filtered') => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve({
        port,
        state,
        service: SERVICE_MAP[port],
        banner: banner.substring(0, 200) || undefined,
      });
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      socket.once('data', (data) => {
        banner = data.toString('utf8').replace(/[\r\n]+/g, ' ').trim();
        cleanup('Open');
      });
      setTimeout(() => cleanup('Open'), 500);
    });
    socket.on('timeout', () => cleanup('Filtered'));
    socket.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ECONNREFUSED') cleanup('Closed');
      else cleanup('Filtered');
    });

    socket.connect(port, ip);
  });
}

export async function tcpScan(
  ip: string,
  ports: number[],
  maxConcurrent = 20,
  timeoutMs = 2000,
  onProgress?: (done: number, total: number) => void
): Promise<TCPScanResult> {
  const allResults: PortResult[] = [];
  let done = 0;

  for (let i = 0; i < ports.length; i += maxConcurrent) {
    const batch = ports.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(async (port) => {
        const r = await checkPort(ip, port, timeoutMs);
        done++;
        if (onProgress) onProgress(done, ports.length);
        return r;
      })
    );
    allResults.push(...batchResults);
  }

  return {
    ip,
    open_ports: allResults.filter((r) => r.state === 'Open'),
    closed_ports: allResults.filter((r) => r.state === 'Closed').map((r) => r.port),
    filtered_ports: allResults.filter((r) => r.state === 'Filtered').map((r) => r.port),
  };
}

export function expandPortList(spec: string): number[] {
  const ports = new Set<number>();
  for (const part of spec.split(',')) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number);
      for (let p = start; p <= Math.min(end, 65535); p++) ports.add(p);
    } else {
      const p = parseInt(trimmed);
      if (!isNaN(p) && p > 0 && p <= 65535) ports.add(p);
    }
  }
  return Array.from(ports).sort((a, b) => a - b);
}

export const TOP_20_PORTS = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 993, 995, 1433, 3306, 3389, 5432, 5900, 8080, 8443, 9200];
export const TOP_100_PORTS = [
  1, 3, 7, 9, 13, 17, 19, 20, 21, 22, 23, 25, 26, 37, 53, 79, 80, 81, 88, 106,
  110, 111, 113, 119, 135, 139, 143, 144, 179, 199, 389, 427, 443, 444, 445, 465,
  513, 514, 515, 543, 544, 548, 554, 587, 631, 646, 873, 990, 993, 995, 1025,
  1026, 1027, 1028, 1029, 1110, 1433, 1720, 1723, 1755, 1900, 2000, 2001, 2049,
  2121, 2717, 3000, 3128, 3306, 3389, 3986, 4899, 5000, 5009, 5051, 5060, 5101,
  5190, 5357, 5432, 5631, 5666, 5800, 5900, 6000, 6001, 6646, 7070, 8000, 8008,
  8009, 8080, 8081, 8443, 8888, 9100, 9999, 10000, 32768, 49152, 49153, 49154,
];

export function getPortList(preset: string, customPorts?: string): number[] {
  switch (preset) {
    case 'top20': return TOP_20_PORTS;
    case 'top100': return TOP_100_PORTS;
    case 'all': return Array.from({ length: 65535 }, (_, i) => i + 1);
    case 'custom': return customPorts ? expandPortList(customPorts) : TOP_20_PORTS;
    default: return TOP_20_PORTS;
  }
}
