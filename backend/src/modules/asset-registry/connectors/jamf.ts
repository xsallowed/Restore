import axios from 'axios';
import { logger } from '../../../lib/logger';

interface JamfConfig {
  base_url: string;
  username: string;
  password: string;
}

export class JamfConnector {
  private config: JamfConfig;
  private bearerToken?: string;
  private tokenExpiry?: Date;

  constructor(config: JamfConfig) {
    this.config = config;
  }

  private async getBearerToken(): Promise<string> {
    if (this.bearerToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.bearerToken;
    }

    const response = await axios.post(
      `${this.config.base_url}/api/v1/auth/token`,
      {},
      {
        auth: { username: this.config.username, password: this.config.password },
        timeout: 10000,
      }
    );

    this.bearerToken = response.data.token;
    // Jamf tokens expire in 30 minutes — refresh at 25 minutes
    this.tokenExpiry = new Date(Date.now() + 25 * 60 * 1000);
    return this.bearerToken!;
  }

  private async request<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const token = await this.getBearerToken();
    const response = await axios.get(`${this.config.base_url}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      params,
      timeout: 30000,
    });
    return response.data;
  }

  async fetchAllComputers(): Promise<any[]> {
    const computers: any[] = [];
    let page = 0;
    const pageSize = 100;

    while (true) {
      const resp: any = await this.request('/api/v1/computers-preview', {
        'page-size': pageSize,
        page,
      });

      const results = resp.results || [];
      computers.push(...results);

      if (results.length < pageSize || computers.length >= 10000) break;
      page++;
    }

    logger.info(`Jamf: fetched ${computers.length} computers`);
    return computers;
  }

  async fetchAllMobileDevices(): Promise<any[]> {
    const devices: any[] = [];
    let page = 0;
    const pageSize = 100;

    while (true) {
      try {
        const resp: any = await this.request('/api/v2/mobile-devices', {
          'page-size': pageSize,
          page,
        });
        const results = resp.results || [];
        devices.push(...results);
        if (results.length < pageSize) break;
        page++;
      } catch {
        break;
      }
    }

    return devices;
  }

  mapComputerToAsset(computer: any) {
    return {
      asset_name: computer.name || computer.udid,
      hostname: computer.name,
      ip_address: computer.ipAddress,
      serial_number: computer.serialNumber,
      os_version: computer.operatingSystemVersion,
      os_name: 'macOS',
      last_seen: computer.lastContactTime,
      manufacturer: 'Apple',
      discovery_source: 'Jamf',
    };
  }

  mapMobileToAsset(device: any) {
    return {
      asset_name: device.name || device.udid,
      hostname: device.name,
      serial_number: device.serialNumber,
      os_name: device.osType || 'iOS',
      os_version: device.osVersion,
      last_seen: device.lastInventoryUpdate,
      manufacturer: 'Apple',
      discovery_source: 'Jamf',
    };
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.getBearerToken();
      const resp: any = await this.request('/api/v1/computers-preview', { 'page-size': 1, page: 0 });
      const total = resp.totalCount ?? 0;
      return { success: true, message: `Connected to Jamf Pro. ${total} computers available.` };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  }
}
