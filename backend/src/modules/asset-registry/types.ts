// Asset Registry TypeScript Types and Interfaces

// Asset Status Enum
export enum AssetStatus {
  Active = 'Active',
  Inactive = 'Inactive',
  Decommissioned = 'Decommissioned',
  Unknown = 'Unknown',
  Unverified = 'Unverified'
}

// Asset Type Enum
export enum AssetType {
  Server = 'Server',
  Workstation = 'Workstation',
  Laptop = 'Laptop',
  Mobile = 'Mobile',
  NetworkDevice = 'NetworkDevice',
  VM = 'VM',
  CloudInstance = 'CloudInstance',
  IoT = 'IoT',
  Unknown = 'Unknown'
}

// Verification Status Enum
export enum VerificationStatus {
  Online = 'Online',
  Offline = 'Offline',
  Degraded = 'Degraded',
  Unknown = 'Unknown'
}

// Asset Core Interface
export interface Asset {
  id: string; // UUID
  asset_id: string; // Unique asset identifier
  
  // Basic Identity
  hostname: string;
  display_name?: string;
  asset_type: AssetType;
  
  // Network
  primary_ip_address?: string; // INET
  secondary_ip_addresses: string[];
  mac_addresses: string[];
  
  // Operating System
  os_name?: string;
  os_version?: string;
  os_build?: string;
  
  // Hardware
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  cpu_cores?: number;
  ram_gb?: number;
  storage_gb?: number;
  
  // Location
  site_name?: string;
  building?: string;
  room?: string;
  rack_name?: string;
  rack_position?: number;
  
  // Ownership
  business_unit?: string;
  owner_name?: string;
  owner_email?: string;
  owner_phone?: string;
  secondary_contact_name?: string;
  secondary_contact_email?: string;
  
  // Status & Lifecycle
  status: AssetStatus;
  purchase_date?: string; // ISO date
  warranty_expiry_date?: string; // ISO date
  end_of_life_date?: string; // ISO date
  
  // Security
  cve_count: number;
  last_vuln_scan_date?: string; // ISO timestamp
  patch_level?: string;
  confidence_score: number;
  
  // Discovery & Tracking
  discovery_source?: string;
  last_seen: string; // ISO timestamp
  last_verified?: string; // ISO timestamp
  verification_status?: VerificationStatus;
  
  // Metadata
  tags: string[];
  notes?: string;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
  created_by?: string; // UUID
  updated_by?: string; // UUID
}

// Asset Create/Update Request
export interface CreateAssetRequest {
  hostname: string;
  display_name?: string;
  asset_type: AssetType;
  primary_ip_address?: string;
  secondary_ip_addresses?: string[];
  mac_addresses?: string[];
  os_name?: string;
  os_version?: string;
  os_build?: string;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  cpu_cores?: number;
  ram_gb?: number;
  storage_gb?: number;
  site_name?: string;
  building?: string;
  room?: string;
  rack_name?: string;
  rack_position?: number;
  business_unit?: string;
  owner_name?: string;
  owner_email?: string;
  owner_phone?: string;
  secondary_contact_name?: string;
  secondary_contact_email?: string;
  status?: AssetStatus;
  purchase_date?: string;
  warranty_expiry_date?: string;
  end_of_life_date?: string;
  tags?: string[];
  notes?: string;
}

export interface UpdateAssetRequest extends Partial<CreateAssetRequest> {
  id: string;
}

// Asset Software
export interface AssetSoftware {
  id: string;
  asset_id: string;
  name: string;
  version?: string;
  vendor?: string;
  install_date?: string;
  license_key?: string;
  last_updated: string;
}

// Network Interface
export interface AssetNetworkInterface {
  id: string;
  asset_id: string;
  interface_name?: string;
  ip_address: string;
  mac_address?: string;
  subnet_mask?: string;
  gateway?: string;
  dns_servers: string[];
  dhcp_enabled: boolean;
  active: boolean;
}

// Discovery Inbox Status
export enum DiscoveryInboxStatus {
  Pending = 'Pending',
  Confirmed = 'Confirmed',
  Merged = 'Merged',
  Dismissed = 'Dismissed'
}

// Discovery Inbox Entry
export interface DiscoveryInboxEntry {
  id: string;
  hostname?: string;
  ip_addresses: string[];
  mac_addresses: string[];
  evidence_source: string; // PCAP, DNS, NetFlow, SNMP, etc.
  evidence_details: Record<string, unknown>; // Raw discovery data
  confidence_score: number; // 0-100
  last_seen?: string;
  status: DiscoveryInboxStatus;
  matched_asset_id?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
}

// Asset Audit Log Entry
export interface AssetAuditLogEntry {
  id: string;
  asset_id?: string;
  action: string; // CREATE, UPDATE, DELETE, VERIFY, MERGE
  changed_fields: Record<string, { old: unknown; new: unknown }>; // Field changes
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

// Connector Type Enum
export enum ConnectorType {
  Intune = 'intune',
  ServiceNow = 'servicenow',
  Generic = 'generic',
  SNMP = 'snmp',
  Nmap = 'nmap',
  PCAP = 'pcap',
  NetFlow = 'netflow',
  DNS = 'dns'
}

// Connector Sync Status
export enum ConnectorSyncStatus {
  Running = 'Running',
  Success = 'Success',
  Failed = 'Failed',
  Pending = 'Pending'
}

// Connector Configuration (base)
export interface ConnectorConfig {
  [key: string]: unknown;
}

// Intune Connector Config
export interface IntuneConnectorConfig extends ConnectorConfig {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  api_version?: string;
}

// ServiceNow Connector Config
export interface ServiceNowConnectorConfig extends ConnectorConfig {
  instance_url: string;
  api_key: string;
  table_name?: string;
}

// Generic REST Connector Config
export interface GenericRestConnectorConfig extends ConnectorConfig {
  base_url: string;
  api_key?: string;
  auth_header?: string;
  endpoints: {
    list: string;
    detail?: string;
  };
}

// Connector Interface
export interface Connector {
  id: string;
  name: string;
  type: ConnectorType;
  description?: string;
  is_enabled: boolean;
  config_encrypted: string; // Encrypted JSON (store encrypted)
  last_sync?: string;
  next_sync?: string;
  sync_interval_minutes: number;
  sync_status?: ConnectorSyncStatus;
  last_error?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  updated_by?: string;
}

// Connector Create/Update Request
export interface CreateConnectorRequest {
  name: string;
  type: ConnectorType;
  description?: string;
  is_enabled?: boolean;
  config: ConnectorConfig;
  sync_interval_minutes?: number;
}

// Connector Sync Log
export interface ConnectorSyncLog {
  id: string;
  connector_id: string;
  sync_started_at: string;
  sync_completed_at?: string;
  status: ConnectorSyncStatus;
  assets_discovered: number;
  assets_updated: number;
  assets_merged: number;
  error_message?: string;
  sync_log?: string;
}

// Health Check Type
export enum HealthCheckType {
  Ping = 'ping',
  TCPPort = 'tcp_port',
  HTTP = 'http',
  SSHBanner = 'ssh_banner',
  WMI = 'wmi'
}

// Health Check Status
export enum HealthCheckStatus {
  Online = 'Online',
  Offline = 'Offline',
  Filtered = 'Filtered',
  Unknown = 'Unknown'
}

// Health Check Result
export interface HealthCheckResult {
  id: string;
  asset_id: string;
  check_type: HealthCheckType;
  check_target?: string; // Port, URL, etc.
  status: HealthCheckStatus;
  response_time_ms?: number;
  last_checked: string;
  check_count: number;
  failure_count: number;
}

// CSV Import Session Status
export enum CSVImportStatus {
  Pending = 'Pending',
  Validating = 'Validating',
  Validated = 'Validated',
  Processing = 'Processing',
  Completed = 'Completed',
  Failed = 'Failed'
}

// CSV Import Session
export interface CSVImportSession {
  id: string;
  filename: string;
  file_size: number;
  total_rows: number;
  successful_rows: number;
  failed_rows: number;
  field_mapping: Record<string, string>; // CSV column -> Asset field mapping
  status: CSVImportStatus;
  error_message?: string;
  created_by?: string;
  created_at: string;
  completed_at?: string;
}

// Import Row Error
export interface ImportRowError {
  id: string;
  import_session_id: string;
  row_number: number;
  row_data: Record<string, unknown>;
  error_message: string;
}

// Query/Filter Types
export interface AssetFilter {
  status?: AssetStatus[];
  asset_type?: AssetType[];
  discovery_source?: string[];
  business_unit?: string[];
  verification_status?: VerificationStatus[];
  tags?: string[];
  search?: string; // Full-text search across hostname, IP, etc.
}

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// ─── SCAN TYPES ─────────────────────────────────────────────────────────────

// Scan Type Enum
export enum ScanType {
  ICMP = 'ICMP',
  TCP = 'TCP',
  FULL_DISCOVERY = 'FULL_DISCOVERY',
  NMAP = 'NMAP',
  SNMP = 'SNMP',
  HTTP = 'HTTP',
}

// Scan Target Type Enum
export enum ScanTargetType {
  SINGLE_IP = 'SINGLE_IP',
  IP_RANGE = 'IP_RANGE',
  CIDR = 'CIDR',
  ASSET_GROUP = 'ASSET_GROUP',
  ALL_ACTIVE = 'ALL_ACTIVE',
}

// Scan Timing Enum
export enum ScanTiming {
  SLOW = 'Slow',
  NORMAL = 'Normal',
  FAST = 'Fast',
}

// Scan Status Enum
export enum ScanStatus {
  QUEUED = 'Queued',
  RUNNING = 'Running',
  COMPLETE = 'Complete',
  FAILED = 'Failed',
  CANCELLED = 'Cancelled',
}

// Scan Result Status Enum
export enum ScanResultStatus {
  ONLINE = 'Online',
  OFFLINE = 'Offline',
  FILTERED = 'Filtered',
}

// Port Configuration Interface
export interface PortConfig {
  preset?: 'top20' | 'top100' | 'all' | 'custom';
  custom_ports?: string; // "22,80,443,3389,8080-8090"
  port_list?: number[]; // Expanded list
}

// Credentials for authenticated scans
export interface ScanCredentials {
  type: 'ssh' | 'wmi';
  username: string;
  password?: string;
  private_key?: string;
  domain?: string;
}

// Target Specification
export interface TargetSpec {
  type: ScanTargetType;
  value: string; // IP, range, CIDR, or group_id
  asset_group_id?: string; // When type is ASSET_GROUP
  ips?: string[]; // Expanded list of IPs to scan
}

// Post-Scan Actions
export interface PostScanActions {
  create_new_assets: boolean;
  update_existing_assets: boolean;
  flag_unresponsive: boolean;
  send_alert_new_hosts: boolean;
  add_to_discovery_inbox: boolean;
}

// Scan Configuration (Create Request)
export interface CreateScanRequest {
  name: string;
  description?: string;
  scan_type: ScanType;
  target_type: ScanTargetType;
  target_spec: TargetSpec;
  port_config?: PortConfig;
  timing: ScanTiming;
  credentials?: ScanCredentials;
  schedule_type: 'once' | 'scheduled' | 'recurring';
  scheduled_datetime?: string; // ISO 8601
  schedule_cron?: string; // For recurring scans
  post_scan_actions: PostScanActions;
}

// Scan Interface
export interface Scan {
  id: number;
  scan_id: string;
  name: string;
  description?: string;
  scan_type: ScanType;
  target_type: ScanTargetType;
  target_spec: TargetSpec;
  port_config?: PortConfig;
  timing: ScanTiming;
  schedule_type: 'once' | 'scheduled' | 'recurring';
  scheduled_datetime?: string;
  schedule_cron?: string;
  post_scan_actions: PostScanActions;
  status: ScanStatus;
  started_at?: string;
  completed_at?: string;
  total_hosts: number;
  hosts_up: number;
  hosts_down: number;
  new_discovered: number;
  error_message?: string;
  created_by: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

// Port Information
export interface PortInfo {
  port: number;
  service: string;
  banner?: string;
  product?: string;
  version?: string;
}

// OS Fingerprint
export interface OSFingerprint {
  name: string;
  accuracy: number; // 0-100 percentage
  vendor?: string;
}

// SSL Certificate Info
export interface SSLCertInfo {
  subject: string;
  issuer: string;
  expiry: string; // ISO 8601
  validity: 'valid' | 'expired' | 'unknown';
}

// SNMP Interface Info
export interface SNMPInterface {
  index: number;
  description: string;
  mac_address?: string;
  status: 'up' | 'down';
}

// Scan Result Interface
export interface ScanResult {
  id: number;
  result_id: string;
  scan_id: string;
  target_ip: string;
  hostname?: string;
  mac_address?: string;
  status: ScanResultStatus;
  latency_ms?: number;
  packet_loss_pct?: number;
  ttl?: number;
  ttl_hint?: string; // Linux, Windows, NetworkDevice
  open_ports?: PortInfo[];
  closed_ports?: number[];
  filtered_ports?: number[];
  os_fingerprint?: OSFingerprint;
  services?: PortInfo[];
  confidence_score: number;
  ssl_cert_info?: SSLCertInfo;
  http_status_code?: number;
  http_response_time_ms?: number;
  page_title?: string;
  server_header?: string;
  snmp_sysname?: string;
  snmp_sysdescr?: string;
  snmp_interfaces?: SNMPInterface[];
  matched_asset_id?: string;
  is_new_discovery: boolean;
  dismissed: boolean;
  created_at: string;
  updated_at: string;
}

// Scan Progress Log Entry
export interface ScanProgressLog {
  id: number;
  log_id: string;
  scan_id: string;
  timestamp: string;
  message: string;
  status?: 'Info' | 'Warning' | 'Error';
  hosts_completed?: number;
  hosts_total?: number;
  current_host?: string;
}

// Asset Group Interface
export interface AssetGroup {
  id: number;
  group_id: string;
  name: string;
  description?: string;
  asset_ids: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}
