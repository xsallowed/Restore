import axios from 'axios';
import { logger } from '../../../lib/logger';

interface TenableConfig {
  access_key: string;
  secret_key: string;
  base_url?: string;
}

export class TenableConnector {
  private config: TenableConfig;
  private baseUrl: string;

  constructor(config: TenableConfig) {
    this.config = config;
    this.baseUrl = config.base_url || 'https://cloud.tenable.com';
  }

  private get headers() {
    return {
      'X-ApiKeys': `accessKey=${this.config.access_key};secretKey=${this.config.secret_key}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const response = await axios.get(`${this.baseUrl}${endpoint}`, {
      headers: this.headers,
      params,
      timeout: 30000,
    });
    return response.data;
  }

  async fetchAllAssets(): Promise<any[]> {
    const assets: any[] = [];
    let cursor: string | undefined;

    while (true) {
      const params: Record<string, any> = { limit: 100 };
      if (cursor) params.after = cursor;

      const resp: any = await this.request('/assets', params);
      const records: any[] = resp.assets || [];
      assets.push(...records);

      cursor = resp.next_page;
      if (!cursor || records.length === 0) break;
      if (assets.length >= 10000) {
        logger.warn('Tenable: hit 10,000 record limit');
        break;
      }
    }

    return assets;
  }

  mapToAsset(asset: any) {
    return {
      asset_name: asset.fqdns?.[0] || asset.ipv4s?.[0] || 'Unknown',
      hostname: asset.fqdns?.[0],
      ip_address: asset.ipv4s?.[0],
      mac_address: asset.mac_addresses?.[0],
      os_name: asset.operating_systems?.[0],
      last_seen: asset.last_seen,
      discovery_source: 'Tenable',
    };
  }

  async getAssetVulnerabilities(assetId: string): Promise<any[]> {
    try {
      const resp: any = await this.request(`/workbenches/assets/${assetId}/vulnerabilities`);
      return resp.vulnerabilities || [];
    } catch {
      return [];
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const resp: any = await this.request('/assets', { limit: 1 });
      const total = resp.total ?? 0;
      return { success: true, message: `Connected. ${total} assets in Tenable.` };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  }
}
