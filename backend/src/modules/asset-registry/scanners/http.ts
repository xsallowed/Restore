import axios from 'axios';
import * as https from 'https';
import * as tls from 'tls';
import { logger } from '../../../lib/logger';

export interface HTTPResult {
  url: string;
  ip: string;
  status_code?: number;
  status_category: 'Healthy' | 'Redirect' | 'ClientError' | 'ServerError' | 'Unreachable';
  response_time_ms?: number;
  page_title?: string;
  server_header?: string;
  ssl_cert_expiry?: string;
  ssl_cert_subject?: string;
  ssl_cert_issuer?: string;
  error?: string;
}

async function getSSLInfo(hostname: string, port = 443): Promise<{ subject?: string; issuer?: string; expiry?: string }> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: hostname, port, servername: hostname, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.destroy();
      if (cert && cert.subject) {
        resolve({
          subject: cert.subject.CN || JSON.stringify(cert.subject),
          issuer: cert.issuer?.CN || JSON.stringify(cert.issuer),
          expiry: cert.valid_to,
        });
      } else {
        resolve({});
      }
    });
    socket.on('error', () => resolve({}));
    socket.setTimeout(5000, () => { socket.destroy(); resolve({}); });
  });
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim().substring(0, 200) : undefined;
}

function statusCategory(code: number): HTTPResult['status_category'] {
  if (code >= 200 && code < 300) return 'Healthy';
  if (code >= 300 && code < 400) return 'Redirect';
  if (code >= 400 && code < 500) return 'ClientError';
  if (code >= 500) return 'ServerError';
  return 'Unreachable';
}

export async function httpCheck(ip: string, port = 80, useHttps = false): Promise<HTTPResult> {
  const protocol = useHttps ? 'https' : 'http';
  const url = `${protocol}://${ip}:${port}`;
  const start = Date.now();

  try {
    const response = await axios.get(url, {
      timeout: 5000,
      maxRedirects: 3,
      validateStatus: () => true,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: { 'User-Agent': 'IT-Asset-Registry/1.0' },
    });

    const elapsed = Date.now() - start;
    const serverHeader = response.headers['server'] as string | undefined;
    const html = typeof response.data === 'string' ? response.data : '';
    const title = extractTitle(html);

    let sslInfo: { subject?: string; issuer?: string; expiry?: string } = {};
    if (useHttps) {
      sslInfo = await getSSLInfo(ip, port);
    }

    return {
      url,
      ip,
      status_code: response.status,
      status_category: statusCategory(response.status),
      response_time_ms: elapsed,
      page_title: title,
      server_header: serverHeader,
      ssl_cert_subject: sslInfo.subject,
      ssl_cert_issuer: sslInfo.issuer,
      ssl_cert_expiry: sslInfo.expiry,
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    logger.debug(`HTTP check failed for ${url}`, { error });
    return { url, ip, status_category: 'Unreachable', response_time_ms: elapsed, error };
  }
}

export async function httpSweep(
  targets: Array<{ ip: string; port?: number; https?: boolean }>,
  maxConcurrent = 10,
  onProgress?: (done: number, total: number) => void
): Promise<HTTPResult[]> {
  const results: HTTPResult[] = [];
  let done = 0;

  for (let i = 0; i < targets.length; i += maxConcurrent) {
    const batch = targets.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const r = await httpCheck(t.ip, t.port ?? (t.https ? 443 : 80), t.https ?? false);
        done++;
        if (onProgress) onProgress(done, targets.length);
        return r;
      })
    );
    results.push(...batchResults);
  }

  return results;
}
