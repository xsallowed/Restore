-- Migration: 002_create_scan_schema
-- Create tables for Active Scan Engine

-- ─── SCANS TABLE ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scans (
  id SERIAL PRIMARY KEY,
  scan_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  scan_type VARCHAR(50) NOT NULL, -- ICMP, TCP, FULL_DISCOVERY, NMAP, SNMP, HTTP
  target_type VARCHAR(50) NOT NULL, -- SINGLE_IP, IP_RANGE, CIDR, ASSET_GROUP, ALL_ACTIVE
  target_spec TEXT NOT NULL, -- JSON object with target details
  port_config JSONB, -- For TCP/FULL/NMAP: preset, custom_ports, port_list
  timing VARCHAR(20) NOT NULL DEFAULT 'Normal', -- Slow, Normal, Fast
  credentials BYTEA, -- AES-256 encrypted credentials (SSH/WMI)
  credentials_iv VARCHAR(255), -- IV for encryption
  schedule_type VARCHAR(50) NOT NULL DEFAULT 'once', -- once, scheduled, recurring
  schedule_cron VARCHAR(255), -- Cron expression for recurring
  scheduled_datetime TIMESTAMP WITH TIME ZONE, -- For single scheduled runs
  post_scan_actions JSONB NOT NULL DEFAULT '{}', -- Checkboxes for actions
  status VARCHAR(50) NOT NULL DEFAULT 'Queued', -- Queued, Running, Complete, Failed, Cancelled
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  total_hosts INTEGER DEFAULT 0,
  hosts_up INTEGER DEFAULT 0,
  hosts_down INTEGER DEFAULT 0,
  new_discovered INTEGER DEFAULT 0,
  error_message TEXT,
  created_by VARCHAR(255) NOT NULL,
  updated_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX (scan_id),
  INDEX (status),
  INDEX (created_at)
);

-- ─── SCAN_RESULTS TABLE ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scan_results (
  id SERIAL PRIMARY KEY,
  result_id VARCHAR(255) UNIQUE NOT NULL,
  scan_id VARCHAR(255) NOT NULL,
  target_ip INET NOT NULL,
  hostname VARCHAR(255),
  mac_address VARCHAR(17),
  status VARCHAR(50) NOT NULL, -- Online, Offline, Filtered
  latency_ms INTEGER,
  packet_loss_pct SMALLINT,
  ttl SMALLINT,
  ttl_hint VARCHAR(50), -- Linux, Windows, NetworkDevice
  open_ports JSONB, -- [{port: 22, service: "SSH", banner: "OpenSSH..."}]
  closed_ports JSONB, -- [80, 443, ...]
  filtered_ports JSONB,
  os_fingerprint JSONB, -- {name: "Linux 5.10-5.15", accuracy: 95}
  services JSONB, -- [{port: 22, name: "SSH", product: "OpenSSH", version: "8.2p1"}]
  confidence_score SMALLINT DEFAULT 0, -- 0-100
  ssl_cert_info JSONB, -- {subject, issuer, expiry, validity}
  http_status_code SMALLINT,
  http_response_time_ms INTEGER,
  page_title VARCHAR(255),
  server_header VARCHAR(255),
  snmp_sysname VARCHAR(255),
  snmp_sysdescr TEXT,
  snmp_interfaces JSONB,
  banner_data JSONB,
  matched_asset_id VARCHAR(255), -- FK reference to assets.asset_id
  is_new_discovery BOOLEAN DEFAULT FALSE,
  dismissed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX (scan_id),
  INDEX (target_ip),
  INDEX (status),
  INDEX (matched_asset_id)
);

-- ─── SCAN_PROGRESS_LOG TABLE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scan_progress_log (
  id SERIAL PRIMARY KEY,
  log_id VARCHAR(255) UNIQUE NOT NULL,
  scan_id VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  message TEXT NOT NULL,
  status VARCHAR(50), -- Info, Warning, Error
  hosts_completed INTEGER,
  hosts_total INTEGER,
  current_host VARCHAR(255),
  INDEX (scan_id),
  INDEX (timestamp)
);

-- ─── SCAN_RESULT_HISTORY TABLE ──────────────────────────────────────────────
-- Track how asset fields change over time from scans
CREATE TABLE IF NOT EXISTS scan_result_history (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(255) NOT NULL,
  scan_id VARCHAR(255) NOT NULL,
  field_name VARCHAR(255) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX (asset_id),
  INDEX (scan_id),
  INDEX (changed_at)
);

-- ─── ASSET GROUPS TABLE ─────────────────────────────────────────────────────
-- Support for scan target type: ASSET_GROUP
CREATE TABLE IF NOT EXISTS asset_groups (
  id SERIAL PRIMARY KEY,
  group_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  asset_ids TEXT[], -- Array of asset_id strings
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX (group_id),
  INDEX (created_at)
);

-- ─── Create foreign key constraints ─────────────────────────────────────────
ALTER TABLE scan_results 
ADD CONSTRAINT fk_scan_results_scans 
FOREIGN KEY (scan_id) REFERENCES scans(scan_id) ON DELETE CASCADE;

ALTER TABLE scan_progress_log 
ADD CONSTRAINT fk_scan_progress_scans 
FOREIGN KEY (scan_id) REFERENCES scans(scan_id) ON DELETE CASCADE;

ALTER TABLE scan_result_history 
ADD CONSTRAINT fk_scan_history_scans 
FOREIGN KEY (scan_id) REFERENCES scans(scan_id) ON DELETE CASCADE;
