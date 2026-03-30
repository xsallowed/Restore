import axios from 'axios';
import { logger } from '../../../lib/logger';

interface CrowdStrikeConfig {
  client_id: string;
  client_secret: string;
  base_url?: string;
}

interface CrowdStrikeDevice {
  device_id: string;
  hostname: string;
  local_ip?: string;
  mac_address?: string;
  os_version?: string;
  platform_name?: string;
  system_manufacturer?: string;
  system_product_name?: string;
  serial_number?: string;
  last_seen?: string;
  agent_version?: string;
  status?: string;
  first_seen?: string;
}

export class CrowdStrikeConnector {
  private config: CrowdStrikeConfig;
  private baseUrl: string;
  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(config: CrowdStrikeConfig) {
    this.config = config;
    this.baseUrl = config.base_url || 'https://api.crowdstrike.com';
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    const response = await axios.post(`${this.baseUrl}/oauth2/token`, new URLSearchParams({
      client_id: this.config.client_id,
      client_secret: this.config.client_secret,
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    this.accessToken = response.data.access_token;
    this.tokenExpiry = new Date(Date.now() + (response.data.expires_in - 60) * 1000);
    return this.accessToken!;
  }

  private async request<T>(endpoint: string, method = 'GET', data?: any): Promise<T> {
    const token = await this.getAccessToken();
    const response = await axios({
      method,
      url: `${this.baseUrl}${endpoint}`,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data,
      timeout: 30000,
    });
    return response.data;
  }

  async fetchAllDevices(): Promise<CrowdStrikeDevice[]> {
    const devices: CrowdStrikeDevice[] = [];
    let offset = 0;
    const limit = 500;

    while (true) {
      // Step 1: Get device IDs
      const queryResp: any = await this.request(
        `/devices/queries/devices/v1?limit=${limit}&offset=${offset}`
      );
      const deviceIds: string[] = queryResp.resources || [];
      if (!deviceIds.length) break;

      // Step 2: Batch fetch device details in groups of 100
      for (let i = 0; i < deviceIds.length; i += 100) {
        const batch = deviceIds.slice(i, i + 100);
        const detailResp: any = await this.request(
          '/devices/entities/devices/v2',
          'POST',
          { ids: batch }
        );
        devices.push(...(detailResp.resources || []));
      }

      if (deviceIds.length < limit) break;
      offset += limit;

      if (devices.length >= 10000) {
        logger.warn('CrowdStrike: hit 10,000 record limit');
        break;
      }
    }

    return devices;
  }

  mapToAsset(device: CrowdStrikeDevice) {
    return {
      asset_name: device.hostname,
      ip_address: device.local_ip,
      mac_address: device.mac_address ? device.mac_address.replace(/-/g, ':').toUpperCase() : undefined,
      os_name: device.platform_name,
      os_version: device.os_version,
      serial_number: device.serial_number,
      manufacturer: device.system_manufacturer,
      model: device.system_product_name,
      last_seen: device.last_seen,
      discovery_source: 'CrowdStrike',
    };
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.getAccessToken();
      const resp: any = await this.request('/devices/queries/devices/v1?limit=1');
      const count = resp.meta?.pagination?.total ?? 0;
      return { success: true, message: `Connected. ${count} devices available.` };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  }
}
