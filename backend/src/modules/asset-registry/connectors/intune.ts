import { BaseConnector, decryptConfig } from './index';
import { sql } from '../../../lib/db';
import axios, { AxiosInstance } from 'axios';

interface IntuneConfig {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  api_version?: string;
}

interface IntuneDevice {
  id: string;
  deviceName: string;
  displayName: string;
  osVersion: string;
  deviceType: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  imei: string;
  meid: string;
  phoneNumber: string;
  androidSecurityPatchLevel: string;
  userDisplayName: string;
  userId: string;
  azureAdDeviceId: string;
  ipAddress: string;
  wifiMacAddress: string;
  isEncrypted: boolean;
  lastSyncDateTime: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
}

export class IntuneConnector extends BaseConnector {
  private config: IntuneConfig;
  private client: AxiosInstance | null = null;
  private accessToken: string = '';
  private tokenExpiresAt: number = 0;

  constructor(name: string, type: string, encryptedConfig: string) {
    super(name, type, {});
    this.config = decryptConfig(encryptedConfig) as IntuneConfig;
    this.validateConfig();
  }

  validateConfig(): void {
    if (!this.config.tenant_id) throw new Error('Intune connector requires tenant_id');
    if (!this.config.client_id) throw new Error('Intune connector requires client_id');
    if (!this.config.client_secret) throw new Error('Intune connector requires client_secret');
  }

  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiresAt > Date.now()) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        `https://login.microsoftonline.com/${this.config.tenant_id}/oauth2/v2.0/token`,
        {
          client_id: this.config.client_id,
          client_secret: this.config.client_secret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000 * 0.9); // Refresh 90% through validity

      this.logDebug('Obtained access token from Intune');
      return this.accessToken;
    } catch (err) {
      this.logError('Failed to obtain access token', err);
      throw new Error('Failed to authenticate with Intune');
    }
  }

  private async getGraphClient(): Promise<AxiosInstance> {
    if (!this.client) {
      const token = await this.getAccessToken();
      this.client = axios.create({
        baseURL: 'https://graph.microsoft.com/v1.0',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
    }
    return this.client;
  }

  private mapIntuneDeviceToAsset(device: IntuneDevice): Record<string, unknown> {
    const assetType = this.mapDeviceTypeToAssetType(device.deviceType);

    return {
      hostname: device.deviceName || device.displayName,
      display_name: device.displayName,
      asset_type: assetType,
      primary_ip_address: device.ipAddress || null,
      mac_addresses: [device.wifiMacAddress].filter(Boolean),
      os_name: 'Windows', // Intune typically manages Windows devices
      os_version: device.osVersion,
      manufacturer: device.manufacturer,
      model: device.model,
      serial_number: device.serialNumber,
      owner_name: device.userDisplayName,
      owner_email: null,
      status: 'Active',
      discovery_source: 'Intune',
      verification_status: 'Online',
      tags: ['intune', device.deviceType?.toLowerCase()].filter(Boolean),
      notes: `Intune Device ID: ${device.id}, Azure AD ID: ${device.azureAdDeviceId}`,
      external_id: device.id,
      external_sync_id: device.azureAdDeviceId,
    };
  }

  private mapDeviceTypeToAssetType(intuneDeviceType?: string): string {
    if (!intuneDeviceType) return 'Unknown';

    const typeMap: Record<string, string> = {
      'windows': 'Workstation',
      'iosDevice': 'Mobile',
      'androidManagedStoreWebApp': 'Mobile',
      'androidDevice': 'Mobile',
      'macOS': 'Laptop',
      'webApp': 'Unknown',
      'officeSuiteApp': 'Unknown',
      'encryptedNotificationContent': 'Unknown',
    };

    return typeMap[intuneDeviceType] || 'Unknown';
  }

  async sync(): Promise<{
    assetsDiscovered: number;
    assetsUpdated: number;
    assetsMerged: number;
    errors: string[];
  }> {
    let assetsDiscovered = 0;
    let assetsUpdated = 0;
    let assetsMerged = 0;
    const errors: string[] = [];

    try {
      this.logDebug('Starting Intune sync');
      const graphClient = await this.getGraphClient();

      // Fetch all managed devices from Intune
      let nextUrl: string | null = 'https://graph.microsoft.com/v1.0/deviceManagement/managedDevices';
      const pageSize = 50;

      while (nextUrl) {
        try {
          const response = await graphClient.get(nextUrl);
          const devices: IntuneDevice[] = response.data.value || [];

          for (const device of devices) {
            try {
              const assetData = this.mapIntuneDeviceToAsset(device);

              // Check if asset already exists
              const existingAssets = await sql<{ id: string }[]>`
                SELECT id FROM assets WHERE primary_ip_address = ${assetData.primary_ip_address} 
                OR (tags @> $1 AND asset_type = ${assetData.asset_type})
              `;

              if (existingAssets.length > 0) {
                // Update existing asset
                await sql`
                  UPDATE assets SET
                    display_name = ${assetData.display_name},
                    os_version = ${assetData.os_version},
                    owner_name = ${assetData.owner_name},
                    last_seen = NOW(),
                    verification_status = 'Online',
                    updated_at = NOW()
                  WHERE id = ${existingAssets[0].id}
                `;
                assetsUpdated++;
              } else {
                // Create new asset
                const asset_id = `AST-INTUNE-${device.id.substring(0, 8)}`;
                await sql`
                  INSERT INTO assets (
                    asset_id, hostname, display_name, asset_type,
                    primary_ip_address, mac_addresses,
                    os_name, os_version,
                    manufacturer, model, serial_number,
                    owner_name, status, discovery_source,
                    verification_status, tags, notes,
                    created_by, updated_by
                  ) VALUES (
                    ${asset_id},
                    ${assetData.hostname},
                    ${assetData.display_name},
                    ${assetData.asset_type},
                    ${assetData.primary_ip_address},
                    ${assetData.mac_addresses},
                    ${assetData.os_name},
                    ${assetData.os_version},
                    ${assetData.manufacturer},
                    ${assetData.model},
                    ${assetData.serial_number},
                    ${assetData.owner_name},
                    ${assetData.status},
                    ${assetData.discovery_source},
                    ${assetData.verification_status},
                    ${assetData.tags},
                    ${assetData.notes},
                    NULL,
                    NULL
                  )
                `;
                assetsDiscovered++;
              }
            } catch (deviceErr) {
              const errMsg = `Failed to sync device ${device.id}: ${String(deviceErr)}`;
              this.logError(errMsg);
              errors.push(errMsg);
            }
          }

          // Check for next page
          nextUrl = response.data['@odata.nextLink'] || null;
        } catch (pageErr) {
          const errMsg = `Failed to fetch devices page: ${String(pageErr)}`;
          this.logError(errMsg);
          errors.push(errMsg);
          break;
        }
      }

      this.logDebug(`Intune sync completed: ${assetsDiscovered} discovered, ${assetsUpdated} updated`, {
        assetsDiscovered,
        assetsUpdated,
        errors: errors.length,
      });
    } catch (err) {
      const errMsg = `Intune sync failed: ${String(err)}`;
      this.logError(errMsg);
      errors.push(errMsg);
    }

    return {
      assetsDiscovered,
      assetsUpdated,
      assetsMerged,
      errors,
    };
  }
}
