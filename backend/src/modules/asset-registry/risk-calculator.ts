import { ApiKey, UserIdentity, ExternalConnection, RiskLevel } from './types';
import { logger } from '../../lib/logger';

interface RiskCalculationResult {
  risk_level: RiskLevel;
  reasons: string[];
}

/**
 * RiskCalculator
 * Auto-calculates risk levels for API Keys, User Identities, and External Connections
 * based on specifications. Returns risk level + array of reasons for audit trail.
 */
export class RiskCalculator {
  /**
   * Calculate risk level for API Key / Secret
   * Critical (any one of):
   *   - exposed_in_code = true
   *   - where_stored = "Hardcoded" or "Code Repository"
   *   - status = "Expired" AND environment = "Production"
   *   - expiry_date is past AND auto_rotate = false
   *   - permission_scope contains "admin" or "*" AND environment = "Production"
   *
   * High (any one of):
   *   - expiry_date is null (non-expiring key)
   *   - next_rotation_due is overdue by 30+ days
   *   - where_stored = ".env file" or "Unknown"
   *   - last_used_date is null AND status = "Active"
   *   - environment = "Production" AND owner_email is null
   *
   * Medium (any one of):
   *   - rotation_interval > 180 days
   *   - auto_rotate = false AND environment = "Production"
   *   - last_used_date > 180 days ago (stale key)
   *   - where_stored = "Vault" but owner_email is null
   *
   * Low: All other cases
   */
  static calculateApiKeyRisk(key: ApiKey): RiskCalculationResult {
    const reasons: string[] = [];
    let riskLevel = RiskLevel.LOW;

    // CRITICAL checks
    if (key.exposed_in_code) {
      reasons.push('Secret has been exposed in source code');
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    if (key.where_stored === 'Hardcoded' || key.where_stored === 'Code Repository') {
      reasons.push(`Secret is stored in ${key.where_stored} (unencrypted and tracked)`);
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    if (key.status === 'Expired' && key.environment === 'Production') {
      reasons.push('Production secret has expired and is no longer valid');
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    if (key.expiry_date && new Date(key.expiry_date) < new Date() && !key.auto_rotate) {
      reasons.push('Secret has expired and automatic rotation is disabled');
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    if (key.permission_scope && key.environment === 'Production') {
      const hasAdminScope = key.permission_scope.includes('admin') || key.permission_scope.includes('*');
      if (hasAdminScope) {
        reasons.push('Secret grants admin/wildcard permissions in Production environment');
        return { risk_level: RiskLevel.CRITICAL, reasons };
      }
    }

    // HIGH checks
    if (!key.expiry_date) {
      reasons.push('Secret does not have an expiration date (non-expiring keys are high risk)');
      riskLevel = RiskLevel.HIGH;
    }

    if (key.next_rotation_due) {
      const daysOverdue = Math.floor(
        (new Date().getTime() - new Date(key.next_rotation_due).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysOverdue >= 30) {
        reasons.push(`Secret rotation is overdue by ${daysOverdue} days`);
        if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
      }
    }

    if (key.where_stored === '.env file' || key.where_stored === 'Unknown') {
      reasons.push(`Secret stored in ${key.where_stored} location (difficult to rotate)`);
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
    }

    if (!key.last_used_date && key.status === 'Active') {
      reasons.push('No usage record found for active secret (may be dormant)');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
    }

    if (key.environment === 'Production' && !key.owner_email) {
      reasons.push('Production secret has no identified owner');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
    }

    // MEDIUM checks
    if (key.rotation_interval && key.rotation_interval > 180) {
      reasons.push(`Rotation interval is ${key.rotation_interval} days (exceeds 180 day recommendation)`);
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.MEDIUM;
    }

    if (!key.auto_rotate && key.environment === 'Production') {
      reasons.push('Production secret rotation is not automated');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.MEDIUM;
    }

    if (key.last_used_date) {
      const daysStale = Math.floor(
        (new Date().getTime() - new Date(key.last_used_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysStale > 180) {
        reasons.push(`Secret has been stale for ${daysStale} days (likely unused)`);
        if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.MEDIUM;
      }
    }

    if (key.where_stored === 'Vault' && !key.owner_email) {
      reasons.push('Vault-stored secret has no assigned owner');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.MEDIUM;
    }

    return { risk_level: riskLevel, reasons };
  }

  /**
   * Calculate risk level for User Identity
   * Critical (any one of):
   *   - orphaned = true (ex-employee, account still active)
   *   - privileged_access = true AND mfa_enabled = false
   *   - account_expires is past AND account_status = Active
   *   - failed_login_count > 10 in last 24 hours
   *   - last_login_ip is from threat intel range (stub for now)
   *
   * High (any one of):
   *   - dormant = true AND privileged_access = true
   *   - mfa_enabled = false AND user_type = Employee
   *   - password_last_set > 180 days ago
   *   - access_review_due is overdue by 30+ days
   *   - user_type = Shared Account (inherently risky)
   *   - account_expires is null AND user_type = Contractor
   *
   * Medium (any one of):
   *   - dormant = true (no login in 90 days)
   *   - mfa_method = SMS (less secure)
   *   - group_memberships > 20 (excessive access)
   *   - no manager_email set (unmanaged)
   *   - last_access_review > 90 days ago
   *
   * Low: All other cases
   */
  static calculateUserRisk(user: UserIdentity): RiskCalculationResult {
    const reasons: string[] = [];
    let riskLevel = RiskLevel.LOW;

    // CRITICAL checks
    if (user.orphaned) {
      reasons.push('Account belongs to terminated employee but remains active');
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    if (user.privileged_access && !user.mfa_enabled) {
      reasons.push('Privileged account has MFA disabled');
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    if (user.account_expires && new Date(user.account_expires) < new Date() && user.account_status === 'Active') {
      reasons.push('Account has expired but is still active');
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    if (user.failed_login_count > 10) {
      reasons.push(`${user.failed_login_count} failed login attempts detected (possible attack)`);
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    // HIGH checks
    if (user.dormant && user.privileged_access) {
      reasons.push('Privileged account has been dormant for 90+ days');
      riskLevel = RiskLevel.HIGH;
    }

    if (!user.mfa_enabled && user.user_type === UserType.EMPLOYEE) {
      reasons.push('Employee account does not have MFA enabled');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
    }

    if (user.password_last_set) {
      const daysOld = Math.floor(
        (new Date().getTime() - new Date(user.password_last_set).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysOld > 180) {
        reasons.push(`Password has not been changed for ${daysOld} days`);
        if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
      }
    }

    if (user.access_review_due) {
      const daysOverdue = Math.floor(
        (new Date().getTime() - new Date(user.access_review_due).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysOverdue >= 30) {
        reasons.push(`Access review is overdue by ${daysOverdue} days`);
        if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
      }
    }

    if (user.user_type === UserType.SHARED_ACCOUNT) {
      reasons.push('Shared accounts cannot be attributed to individuals (inherently risky)');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
    }

    if (user.account_expires === null && user.user_type === UserType.CONTRACTOR) {
      reasons.push('Contractor account has no expiration date set');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
    }

    // MEDIUM checks
    if (user.dormant) {
      reasons.push('Account has been inactive for 90+ days');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.MEDIUM;
    }

    if (user.mfa_method === 'SMS') {
      reasons.push('MFA method is SMS (less secure than authenticator app or hardware token)');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.MEDIUM;
    }

    if (user.group_memberships.length > 20) {
      reasons.push(
        `Account is member of ${user.group_memberships.length} groups (excessive access breadth)`
      );
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.MEDIUM;
    }

    if (!user.manager_email) {
      reasons.push('Account has no manager assigned (unmanaged account)');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.MEDIUM;
    }

    if (user.last_access_review) {
      const daysOld = Math.floor(
        (new Date().getTime() - new Date(user.last_access_review).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysOld > 90) {
        reasons.push(`Last access review was ${daysOld} days ago (due for re-review)`);
        if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.MEDIUM;
      }
    }

    return { risk_level: riskLevel, reasons };
  }

  /**
   * Calculate risk level for External Connection
   * Critical (any one of):
   *   - status = "Unauthorised" (discovered but not approved)
   *   - encryption_in_transit = false
   *   - authentication = "None"
   *   - remote_country is in configurable high-risk list
   *   - approved_by is null AND status = Active
   *   - split_tunnelling = true AND connection_type contains "VPN"
   *
   * High (any one of):
   *   - encryption = "AES-128" or "Unknown"
   *   - review_date is overdue by 30+ days
   *   - expiry_date is past AND status = Active
   *   - authentication = "Pre-shared Key" AND key not rotated in 365 days
   *   - no business_purpose recorded
   *   - owner_team is null
   *
   * Medium (any one of):
   *   - review_date is overdue (< 30 days)
   *   - bandwidth_mbps is null (unmonitored)
   *   - alert_on_drop = false for critical connections
   *   - bytes_out_30d significantly higher than bytes_in (data exfil indicator)
   *
   * Low: All other cases
   */
  static calculateConnectionRisk(conn: ExternalConnection): RiskCalculationResult {
    const reasons: string[] = [];
    let riskLevel = RiskLevel.LOW;

    // CRITICAL checks
    if (conn.status === 'Unauthorised') {
      reasons.push('Connection discovered but not yet approved for use');
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    if (conn.encryption_in_transit === false) {
      reasons.push('Connection has no encryption in transit (unencrypted data flow)');
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    if (conn.authentication === 'None') {
      reasons.push('Connection has no authentication configured');
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    // Check against high-risk countries (stub for now)
    const highRiskCountries = ['KP', 'IR', 'SY']; // North Korea, Iran, Syria - stub list
    if (conn.remote_country && highRiskCountries.includes(conn.remote_country.toUpperCase())) {
      reasons.push(`Remote endpoint is in high-risk jurisdiction: ${conn.remote_country}`);
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    if (!conn.approved_by && conn.status === 'Active') {
      reasons.push('Active connection has no approval record');
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    if (
      conn.split_tunnelling &&
      conn.connection_type &&
      (conn.connection_type.includes('VPN') || conn.connection_type === 'VPN (Site-to-Site)' || conn.connection_type === 'VPN (Remote Access)')
    ) {
      reasons.push('VPN connection has split tunnelling enabled (traffic may bypass firewall)');
      return { risk_level: RiskLevel.CRITICAL, reasons };
    }

    // HIGH checks
    if (conn.encryption === 'AES-128' || conn.encryption === 'Unknown') {
      reasons.push(`Encryption is ${conn.encryption} (weak or unknown)`);
      riskLevel = RiskLevel.HIGH;
    }

    if (conn.review_date) {
      const daysOverdue = Math.floor(
        (new Date().getTime() - new Date(conn.review_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysOverdue >= 30) {
        reasons.push(`Connection review is overdue by ${daysOverdue} days`);
        if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
      }
    }

    if (conn.expiry_date && new Date(conn.expiry_date) < new Date() && conn.status === 'Active') {
      reasons.push('Connection has expired but is still marked Active');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
    }

    if (conn.authentication === 'Pre-shared Key' && conn.last_rotated_date) {
      const daysOld = Math.floor(
        (new Date().getTime() - new Date(conn.last_rotated_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysOld > 365) {
        reasons.push(`Pre-shared key has not been rotated for ${daysOld} days (> 365 days)`);
        if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
      }
    }

    if (!conn.business_purpose) {
      reasons.push('No business purpose recorded for this connection');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
    }

    if (!conn.owner_team) {
      reasons.push('No team assigned as owner for this connection');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.HIGH;
    }

    // MEDIUM checks
    if (conn.review_date) {
      const daysOverdue = Math.floor(
        (new Date().getTime() - new Date(conn.review_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysOverdue > 0 && daysOverdue < 30) {
        reasons.push(`Connection review due is approaching (${daysOverdue} days overdue)`);
        if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.MEDIUM;
      }
    }

    if (!conn.bandwidth_mbps) {
      reasons.push('Connection bandwidth is not monitored');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.MEDIUM;
    }

    if (!conn.alert_on_drop && (conn.status === 'Active' || conn.status === 'Degraded')) {
      reasons.push('Critical connection has no alert configured if it goes offline');
      if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.MEDIUM;
    }

    // Check for potential data exfiltration (outbound significantly higher than inbound)
    if (conn.bytes_in_30d && conn.bytes_out_30d) {
      const ratio = conn.bytes_out_30d / Math.max(conn.bytes_in_30d, 1);
      if (ratio > 5) {
        // outbound is 5x+ higher than inbound
        reasons.push(
          `Unusual traffic pattern: outbound is ${ratio.toFixed(1)}x higher than inbound (potential data exfiltration)`
        );
        if (riskLevel === RiskLevel.LOW) riskLevel = RiskLevel.MEDIUM;
      }
    }

    return { risk_level: riskLevel, reasons };
  }
}

// Import UserType for use in calculateUserRisk
import { UserType } from './types';
