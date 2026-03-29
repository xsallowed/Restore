-- Asset Registry Platform Database Schema
-- PostgreSQL migration for Asset Registry & Discovery Platform

-- 1. Core Assets Table
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id VARCHAR(50) UNIQUE NOT NULL,
  
  -- Basic Identity
  hostname VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  asset_type VARCHAR(50) NOT NULL DEFAULT 'Unknown',
  
  -- Network
  primary_ip_address INET,
  secondary_ip_addresses TEXT[] DEFAULT '{}', -- Array of IP addresses
  mac_addresses TEXT[] DEFAULT '{}', -- Array of MAC addresses
  
  -- Operating System
  os_name VARCHAR(255),
  os_version VARCHAR(100),
  os_build VARCHAR(100),
  
  -- Hardware
  manufacturer VARCHAR(255),
  model VARCHAR(255),
  serial_number VARCHAR(255),
  cpu_cores INT,
  ram_gb INT,
  storage_gb INT,
  
  -- Location
  site_name VARCHAR(255),
  building VARCHAR(255),
  room VARCHAR(100),
  rack_name VARCHAR(100),
  rack_position INT,
  
  -- Ownership
  business_unit VARCHAR(255),
  owner_name VARCHAR(255),
  owner_email VARCHAR(255),
  owner_phone VARCHAR(20),
  secondary_contact_name VARCHAR(255),
  secondary_contact_email VARCHAR(255),
  
  -- Status & Lifecycle
  status VARCHAR(50) DEFAULT 'Active',
  purchase_date DATE,
  warranty_expiry_date DATE,
  end_of_life_date DATE,
  
  -- Security
  cve_count INT DEFAULT 0,
  last_vuln_scan_date TIMESTAMP WITH TIME ZONE,
  patch_level VARCHAR(100),
  confidence_score INT DEFAULT 0,
  
  -- Discovery & Tracking
  discovery_source VARCHAR(100),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_verified TIMESTAMP WITH TIME ZONE,
  verification_status VARCHAR(50),
  
  -- Metadata
  tags TEXT[] DEFAULT '{}', -- Array of tags
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID,
  updated_by UUID
);

CREATE INDEX idx_assets_hostname ON assets(hostname);
CREATE INDEX idx_assets_primary_ip ON assets(primary_ip_address);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_discovery_source ON assets(discovery_source);
CREATE INDEX idx_assets_last_seen ON assets(last_seen);
CREATE INDEX idx_assets_created_at ON assets(created_at);

-- 2. Asset Software Table
CREATE TABLE IF NOT EXISTS asset_software (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(100),
  vendor VARCHAR(255),
  install_date DATE,
  license_key VARCHAR(255),
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_asset_software_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX idx_asset_software_asset ON asset_software(asset_id);

-- 3. Network Interfaces Table
CREATE TABLE IF NOT EXISTS asset_network_interfaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL,
  interface_name VARCHAR(100),
  ip_address INET,
  mac_address MACADDR,
  subnet_mask INET,
  gateway INET,
  dns_servers INET[] DEFAULT '{}',
  dhcp_enabled BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  
  CONSTRAINT fk_network_interfaces_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX idx_network_interfaces_asset ON asset_network_interfaces(asset_id);
CREATE INDEX idx_network_interfaces_ip ON asset_network_interfaces(ip_address);

-- 4. Discovery Inbox Table
CREATE TABLE IF NOT EXISTS discovery_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname VARCHAR(255),
  ip_addresses INET[] DEFAULT '{}',
  mac_addresses MACADDR[] DEFAULT '{}',
  evidence_source VARCHAR(100),
  evidence_details JSONB,
  confidence_score INT DEFAULT 0,
  last_seen TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) DEFAULT 'Pending',
  matched_asset_id UUID REFERENCES assets(id),
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_discovery_inbox_status ON discovery_inbox(status);
CREATE INDEX idx_discovery_inbox_ip ON discovery_inbox USING GIST(ip_addresses inet_ops);
CREATE INDEX idx_discovery_inbox_created ON discovery_inbox(created_at);

-- 5. Audit Log Table
CREATE TABLE IF NOT EXISTS asset_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID,
  action VARCHAR(50) NOT NULL,
  changed_fields JSONB,
  user_id UUID,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_audit_log_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL
);

CREATE INDEX idx_asset_audit_log_asset ON asset_audit_log(asset_id);
CREATE INDEX idx_asset_audit_log_user ON asset_audit_log(user_id);
CREATE INDEX idx_asset_audit_log_created ON asset_audit_log(created_at);

-- 6. Connectors Table
CREATE TABLE IF NOT EXISTS connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT true,
  
  config_encrypted TEXT NOT NULL, -- Encrypted JSON config (AES-256)
  
  last_sync TIMESTAMP WITH TIME ZONE,
  next_sync TIMESTAMP WITH TIME ZONE,
  sync_interval_minutes INT DEFAULT 1440,
  sync_status VARCHAR(50),
  last_error TEXT,
  
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID
);

CREATE INDEX idx_connectors_type ON connectors(type);
CREATE INDEX idx_connectors_enabled ON connectors(is_enabled);

-- 7. Connector Sync Log Table
CREATE TABLE IF NOT EXISTS connector_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL,
  sync_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sync_completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50),
  assets_discovered INT DEFAULT 0,
  assets_updated INT DEFAULT 0,
  assets_merged INT DEFAULT 0,
  error_message TEXT,
  sync_log TEXT,
  
  CONSTRAINT fk_sync_log_connector FOREIGN KEY (connector_id) REFERENCES connectors(id) ON DELETE CASCADE
);

CREATE INDEX idx_connector_sync_log_connector ON connector_sync_log(connector_id);
CREATE INDEX idx_connector_sync_log_started ON connector_sync_log(sync_started_at);

-- 8. Health Check Results Table
CREATE TABLE IF NOT EXISTS health_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL,
  check_type VARCHAR(50),
  check_target VARCHAR(255),
  status VARCHAR(50),
  response_time_ms INT,
  last_checked TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  check_count INT DEFAULT 1,
  failure_count INT DEFAULT 0,
  
  CONSTRAINT fk_health_check_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE INDEX idx_health_check_results_asset ON health_check_results(asset_id);
CREATE INDEX idx_health_check_results_last_checked ON health_check_results(last_checked);

-- 9. CSV Import Sessions Table
CREATE TABLE IF NOT EXISTS csv_import_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255),
  file_size INT,
  total_rows INT,
  successful_rows INT,
  failed_rows INT,
  field_mapping JSONB,
  status VARCHAR(50) DEFAULT 'Pending',
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_csv_import_sessions_status ON csv_import_sessions(status);
CREATE INDEX idx_csv_import_sessions_created ON csv_import_sessions(created_at);

-- 10. Import Row Errors Table
CREATE TABLE IF NOT EXISTS import_row_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_session_id UUID,
  row_number INT,
  row_data JSONB,
  error_message TEXT,
  
  CONSTRAINT fk_import_row_errors_session FOREIGN KEY (import_session_id) REFERENCES csv_import_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_import_row_errors_session ON import_row_errors(import_session_id);
