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
