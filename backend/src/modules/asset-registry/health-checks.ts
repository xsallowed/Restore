import { execSync } from 'child_process';
import { logger } from '../../lib/logger';
import { sql } from '../../lib/db';

export enum HealthCheckType {
  Ping = 'ping',
  TCP = 'tcp_port',
  HTTP = 'http',
  SSHBanner = 'ssh_banner',
  WMI = 'wmi',
}

export enum HealthCheckStatus {
  Online = 'Online',
  Offline = 'Offline',
  Filtered = 'Filtered',
  Unknown = 'Unknown',
}

interface HealthCheckResult {
  status: HealthCheckStatus;
  responseTime: number;
  details?: string;
}

export class HealthCheckService {
  /**
   * Perform ICMP ping check
   */
  static async checkPing(host: string): Promise<HealthCheckResult> {
    try {
      const startTime = Date.now();
      const command = process.platform === 'win32' ? `ping -n 1 ${host}` : `ping -c 1 ${host}`;
      
      execSync(command, { stdio: 'pipe', timeout: 5000 });
      
      return {
        status: HealthCheckStatus.Online,
        responseTime: Date.now() - startTime,
      };
    } catch (err) {
      return {
        status: HealthCheckStatus.Offline,
        responseTime: 5000,
        details: 'Ping timeout or host unreachable',
      };
    }
  }

  /**
   * Perform TCP port check
   */
  static async checkTCPPort(host: string, port: number): Promise<HealthCheckResult> {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      const startTime = Date.now();
      const timeout = 5000;

      socket.setTimeout(timeout);

      socket.on('connect', () => {
        const responseTime = Date.now() - startTime;
        socket.destroy();
        resolve({
          status: HealthCheckStatus.Online,
          responseTime,
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          status: HealthCheckStatus.Filtered,
          responseTime: timeout,
          details: 'TCP port timeout',
        });
      });

      socket.on('error', (err) => {
        socket.destroy();
        resolve({
          status: HealthCheckStatus.Offline,
          responseTime: Date.now() - startTime,
          details: `TCP connection error: ${String(err).substring(0, 50)}`,
        });
      });

      socket.connect(port, host);
    });
  }

  /**
   * Perform HTTP connectivity check
   */
  static async checkHTTP(url: string): Promise<HealthCheckResult> {
    try {
      const axios = require('axios');
      const startTime = Date.now();

      const response = await axios.head(url, {
        timeout: 5000,
        validateStatus: () => true, // Accept any status code
      });

      const responseTime = Date.now() - startTime;

      if (response.status < 500) {
        return {
          status: HealthCheckStatus.Online,
          responseTime,
        };
      } else {
        return {
          status: HealthCheckStatus.Offline,
          responseTime,
          details: `HTTP ${response.status}`,
        };
      }
    } catch (err) {
      return {
        status: HealthCheckStatus.Offline,
        responseTime: 5000,
        details: `HTTP check failed: ${String(err).substring(0, 50)}`,
      };
    }
  }

  /**
   * Perform SSH banner grab
   */
  static async checkSSHBanner(host: string, port: number = 22): Promise<HealthCheckResult> {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      const startTime = Date.now();
      const timeout = 5000;
      let bannerReceived = false;

      socket.setTimeout(timeout);

      socket.on('data', (data) => {
        const banner = data.toString();
        if (banner.includes('SSH')) {
          bannerReceived = true;
          socket.destroy();
          resolve({
            status: HealthCheckStatus.Online,
            responseTime: Date.now() - startTime,
            details: banner.split('\n')[0],
          });
        }
      });

      socket.on('connect', () => {
        // Connected, wait for banner
      });

      socket.on('timeout', () => {
        socket.destroy();
        if (bannerReceived) {
          resolve({
            status: HealthCheckStatus.Online,
            responseTime: timeout,
          });
        } else {
          resolve({
            status: HealthCheckStatus.Filtered,
            responseTime: timeout,
            details: 'SSH port timeout',
          });
        }
      });

      socket.on('error', (err) => {
        socket.destroy();
        resolve({
          status: HealthCheckStatus.Offline,
          responseTime: Date.now() - startTime,
          details: `SSH connection error: ${String(err).substring(0, 50)}`,
        });
      });

      socket.connect(port, host);
    });
  }

  /**
   * Run health check for an asset
   */
  static async runHealthCheck(
    assetId: string,
    host: string,
    checkType: HealthCheckType,
    target?: string
  ): Promise<void> {
    let result: HealthCheckResult;

    try {
      switch (checkType) {
        case HealthCheckType.Ping:
          result = await this.checkPing(host);
          break;
        case HealthCheckType.TCP:
          result = await this.checkTCPPort(host, parseInt(target || '443'));
          break;
        case HealthCheckType.HTTP:
          result = await this.checkHTTP(target || `http://${host}`);
          break;
        case HealthCheckType.SSHBanner:
          result = await this.checkSSHBanner(host, parseInt(target || '22'));
          break;
        default:
          result = {
            status: HealthCheckStatus.Unknown,
            responseTime: 0,
            details: 'Unknown check type',
          };
      }
    } catch (err) {
      logger.error('Health check error', { err: String(err), assetId, checkType });
      result = {
        status: HealthCheckStatus.Unknown,
        responseTime: 0,
        details: String(err),
      };
    }

    // Store result in database
    try {
      const existingChecks = await sql<{ id: string; check_count: number; failure_count: number }[]>`
        SELECT id, check_count, failure_count FROM health_check_results
        WHERE asset_id = ${assetId} AND check_type = ${checkType}
      `;

      if (existingChecks.length > 0) {
        const existing = existingChecks[0];
        const failureCount = result.status === HealthCheckStatus.Online ? 0 : existing.failure_count + 1;

        await sql`
          UPDATE health_check_results SET
            status = ${result.status},
            response_time_ms = ${result.responseTime},
            last_checked = NOW(),
            check_count = ${existing.check_count + 1},
            failure_count = ${failureCount}
          WHERE id = ${existing.id}
        `;
      } else {
        await sql`
          INSERT INTO health_check_results (
            asset_id, check_type, check_target,
            status, response_time_ms, last_checked,
            check_count, failure_count
          ) VALUES (
            ${assetId}, ${checkType}, ${target || null},
            ${result.status}, ${result.responseTime}, NOW(),
            1, ${result.status === HealthCheckStatus.Online ? 0 : 1}
          )
        `;
      }

      // Update asset verification status
      const failureCount = result.status === HealthCheckStatus.Online ? 0 : 1;
      const newVerificationStatus = result.status === HealthCheckStatus.Online ? 'Online' : 'Offline';

      await sql`
        UPDATE assets SET
          verification_status = ${newVerificationStatus},
          last_verified = NOW(),
          last_seen = NOW()
        WHERE id = ${assetId}
      `;
    } catch (dbErr) {
      logger.error('Failed to store health check result', { err: String(dbErr), assetId });
    }
  }

  /**
   * Perform batch health checks on all assets
   */
  static async checkAllAssets(): Promise<{ checked: number; online: number; offline: number }> {
    let checked = 0;
    let online = 0;
    let offline = 0;

    try {
      const assets = await sql<{ id: string; primary_ip_address: string }[]>`
        SELECT id, primary_ip_address FROM assets WHERE status = 'Active' LIMIT 100
      `;

      for (const asset of assets) {
        if (!asset.primary_ip_address) continue;

        checked++;
        const result = await this.checkPing(asset.primary_ip_address);

        if (result.status === HealthCheckStatus.Online) {
          online++;
        } else {
          offline++;
        }

        // Store result
        await this.runHealthCheck(asset.id, asset.primary_ip_address, HealthCheckType.Ping);
      }

      logger.info('Health checks completed', { checked, online, offline });
    } catch (err) {
      logger.error('Batch health check error', { err: String(err) });
    }

    return { checked, online, offline };
  }
}
