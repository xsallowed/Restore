import axios from 'axios';
import { logger } from '../../../lib/logger';

interface ServiceNowConfig {
  instance_url: string; // e.g. https://mycompany.service-now.com
  username: string;
  password: string;
}

export class ServiceNowConnector {
  private config: ServiceNowConfig;

  constructor(config: ServiceNowConfig) {
    this.config = config;
  }

  private get authHeader() {
    const encoded = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    return `Basic ${encoded}`;
  }

  private async request<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const response = await axios.get(`${this.config.instance_url}${endpoint}`, {
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      params,
      timeout: 30000,
    });
    return response.data;
  }

  async fetchAllCIs(table = 'cmdb_ci_computer'): Promise<any[]> {
    const records: any[] = [];
    let offset = 0;
    const limit = 100;

    const fields = [
      'name', 'ip_address', 'mac_address', 'os', 'serial_number',
      'manufacturer', 'model_id.name', 'assigned_to.email',
      'location.name', 'sys_updated_on', 'operational_status',
    ].join(',');

    while (true) {
      const resp: any = await this.request(`/api/now/table/${table}`, {
        sysparm_fields: fields,
        sysparm_limit: limit,
        sysparm_offset: offset,
        sysparm_exclude_reference_link: true,
      });

      const results: any[] = resp.result || [];
      records.push(...results);

      if (results.length < limit) break;
      offset += limit;

      if (records.length >= 10000) {
        logger.warn(`ServiceNow: hit 10,000 record limit for ${table}`);
        break;
      }

      // Rate limiting — respect 429
      await new Promise((r) => setTimeout(r, 100));
    }

    logger.info(`ServiceNow: fetched ${records.length} records from ${table}`);
    return records;
  }

  mapToAsset(record: any) {
    const statusMap: Record<string, string> = {
      '1': 'Active', '2': 'Inactive', '3': 'Decommissioned', '6': 'Unknown',
    };
    return {
      asset_name: record.name,
      ip_address: record.ip_address,
      mac_address: record.mac_address,
      os_name: record.os,
      serial_number: record.serial_number,
      manufacturer: record.manufacturer,
      model: record['model_id.name'],
      owner_email: record['assigned_to.email'],
      location: record['location.name'],
      last_seen: record.sys_updated_on,
      status: statusMap[record.operational_status] || 'Unknown',
      discovery_source: 'ServiceNow',
    };
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const resp: any = await this.request('/api/now/table/cmdb_ci_computer', {
        sysparm_limit: 1,
        sysparm_fields: 'name',
      });
      return { success: true, message: `Connected to ServiceNow. CMDB accessible.` };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  }
}
