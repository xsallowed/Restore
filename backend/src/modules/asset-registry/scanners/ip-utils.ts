// ─── IP Expansion Utilities ──────────────────────────────────────────────────

export function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.');
}

export function expandCIDR(cidr: string): string[] {
  const [base, prefixLen] = cidr.split('/');
  const prefix = parseInt(prefixLen);
  const mask = (~0 << (32 - prefix)) >>> 0;
  const network = (ipToInt(base) & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const ips: string[] = [];
  for (let i = network + 1; i < broadcast; i++) {
    ips.push(intToIp(i));
    if (ips.length > 65534) break;
  }
  return ips;
}

export function expandIPRange(range: string): string[] {
  if (range.includes('/')) return expandCIDR(range);
  if (range.includes('-')) {
    const [start, endPart] = range.split('-');
    const startInt = ipToInt(start.trim());
    const endPart2 = endPart.trim();
    // Support both 192.168.1.1-254 and 192.168.1.1-192.168.1.254
    const endInt = endPart2.includes('.') ? ipToInt(endPart2) : ipToInt(start.replace(/\.\d+$/, `.${endPart2}`));
    const ips: string[] = [];
    for (let i = startInt; i <= endInt; i++) {
      ips.push(intToIp(i));
      if (ips.length > 65534) break;
    }
    return ips;
  }
  return [range.trim()];
}
