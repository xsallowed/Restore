import axios from 'axios';
import { parse as parseHTML } from 'node-html-parser';
import { logger } from '../lib/logger';

// ─── Confluence Connector ─────────────────────────────────────────────────
interface ConfluenceConfig {
  baseUrl: string;       // e.g. https://org.atlassian.net/wiki
  spaceKey: string;
  ancestorPageId?: string;
}

export class ConfluenceConnector {
  private config: ConfluenceConfig;
  private token: string | undefined;

  constructor(config: ConfluenceConfig, credentialRef?: string) {
    this.config = config;
    this.token = credentialRef ? process.env[credentialRef] : undefined;
  }

  private get headers() {
    return {
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      'Content-Type': 'application/json',
    };
  }

  async listAndFetch(): Promise<Array<{ sourceRef: string; title: string; content: string }>> {
    const params: Record<string, string> = {
      spaceKey: this.config.spaceKey,
      expand: 'body.storage',
      limit: '50',
    };
    if (this.config.ancestorPageId) {
      params['ancestor'] = this.config.ancestorPageId;
    }

    const url = `${this.config.baseUrl}/rest/api/content`;
    const { data } = await axios.get(url, { headers: this.headers, params });

    const results: Array<{ sourceRef: string; title: string; content: string }> = [];
    for (const page of data.results || []) {
      const htmlContent = page.body?.storage?.value || '';
      const textContent = parseHTML(htmlContent).text;
      results.push({
        sourceRef: `confluence:${page.id}`,
        title: page.title,
        content: textContent,
      });
    }

    logger.info('Confluence connector fetched', { space: this.config.spaceKey, count: results.length });
    return results;
  }
}

// ─── HTTP Connector ───────────────────────────────────────────────────────
interface HttpConfig {
  urls: string[];
  authType?: 'none' | 'bearer' | 'basic';
}

export class HttpConnector {
  private config: HttpConfig;
  private credential: string | undefined;

  constructor(config: HttpConfig, credentialRef?: string) {
    this.config = config;
    this.credential = credentialRef ? process.env[credentialRef] : undefined;
  }

  async listAndFetch(): Promise<Array<{ sourceRef: string; title: string; content: string }>> {
    const results: Array<{ sourceRef: string; title: string; content: string }> = [];

    for (const url of this.config.urls) {
      const headers: Record<string, string> = {};
      if (this.config.authType === 'bearer' && this.credential) {
        headers['Authorization'] = `Bearer ${this.credential}`;
      }

      const { data, headers: resHeaders } = await axios.get<string>(url, { headers, responseType: 'text' });
      const contentType = resHeaders['content-type'] || '';

      let text = data;
      if (contentType.includes('html')) {
        text = parseHTML(data).text;
      }

      results.push({
        sourceRef: url,
        title: url.split('/').pop() || url,
        content: text,
      });
    }

    return results;
  }
}
