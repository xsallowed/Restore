import axios from 'axios';
import { logger } from '../lib/logger';

interface GitHubConfig {
  owner: string;
  repo: string;
  branch?: string;
  paths?: string[];      // directories to scan, default: root
  fileExtensions?: string[];
}

export class GitHubConnector {
  private config: GitHubConfig;
  private token: string | undefined;
  private baseURL = 'https://api.github.com';

  constructor(config: GitHubConfig, credentialRef?: string) {
    this.config = config;
    this.token = credentialRef ? process.env[credentialRef] : undefined;
  }

  private get headers() {
    return {
      Accept: 'application/vnd.github.v3+json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
    };
  }

  async listAndFetch(): Promise<Array<{ sourceRef: string; title: string; content: string }>> {
    const paths = this.config.paths || [''];
    const extensions = this.config.fileExtensions || ['.md', '.txt', '.yaml', '.yml'];
    const results: Array<{ sourceRef: string; title: string; content: string }> = [];

    for (const path of paths) {
      await this.scanDirectory(path, extensions, results);
    }

    logger.info('GitHub connector fetched', { repo: `${this.config.owner}/${this.config.repo}`, count: results.length });
    return results;
  }

  private async scanDirectory(
    path: string,
    extensions: string[],
    results: Array<{ sourceRef: string; title: string; content: string }>
  ): Promise<void> {
    const url = `${this.baseURL}/repos/${this.config.owner}/${this.config.repo}/contents/${path}`;
    const branch = this.config.branch || 'main';

    const { data } = await axios.get(url, {
      headers: this.headers,
      params: { ref: branch },
    });

    const items = Array.isArray(data) ? data : [data];

    for (const item of items) {
      if (item.type === 'dir') {
        await this.scanDirectory(item.path, extensions, results);
      } else if (item.type === 'file') {
        const ext = '.' + item.name.split('.').pop()?.toLowerCase();
        if (extensions.includes(ext)) {
          const content = await this.fetchFile(item.download_url);
          results.push({
            sourceRef: item.path,
            title: item.name.replace(/\.(md|txt|yaml|yml)$/i, '').replace(/[-_]/g, ' '),
            content,
          });
        }
      }
    }
  }

  private async fetchFile(url: string): Promise<string> {
    const { data } = await axios.get<string>(url, { headers: this.headers, responseType: 'text' });
    return data;
  }
}
