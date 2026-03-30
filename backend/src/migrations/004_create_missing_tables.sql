-- Migration: 004_create_missing_tables
-- Adds: asset_relationships, asset_alerts, asset_attachments, connector failure tracking,
--       audit_log append-only enforcement, rate_limit_log

-- ─── ASSET RELATIONSHIPS TABLE ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_relationships (
  id SERIAL PRIMARY KEY,
  relationship_id VARCHAR(255) UNIQUE NOT NULL,
  source_asset_id VARCHAR(255) NOT NULL,
  relationship_type VARCHAR(100) NOT NULL,
  -- API Key → used_by | API Key → owned_by | User → assigned_device
  -- User → has_access_to | Connection → terminates_at | Connection → used_by
  target_asset_id VARCHAR(255) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255) NOT NULL,
  
  INDEX (source_asset_id),
  INDEX (target_asset_id),
  INDEX (relationship_type)
);

-- ─── ASSET ALERTS TABLE ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_alerts (
  id SERIAL PRIMARY KEY,
  alert_id VARCHAR(255) UNIQUE NOT NULL,
  asset_id VARCHAR(255),
  alert_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL, -- Critical, High, Medium, Low
  status VARCHAR(50) NOT NULL DEFAULT 'Active', -- Active, Acknowledged, Resolved
  owner_email VARCHAR(255),
  recommended_action TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  acknowledged_by VARCHAR(255),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by VARCHAR(255),
  
  INDEX (asset_id),
  INDEX (severity),
  INDEX (status),
  INDEX (created_at)
);

-- ─── ASSET ATTACHMENTS TABLE ─────────────────────────────────────────────────
-- For warranty docs, purchase orders etc.
CREATE TABLE IF NOT EXISTS asset_attachments (
  id SERIAL PRIMARY KEY,
  attachment_id VARCHAR(255) UNIQUE NOT NULL,
  asset_id VARCHAR(255) NOT NULL,
  filename VARCHAR(500) NOT NULL,
  original_filename VARCHAR(500) NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  attachment_type VARCHAR(100), -- warranty, purchase_order, photo, certificate, other
  storage_path TEXT NOT NULL, -- local path or S3 key
  uploaded_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX (asset_id),
  INDEX (attachment_type)
);

-- ─── CONNECTOR FAILURE TRACKING COLUMNS ─────────────────────────────────────
-- Add consecutive_failures counter to connectors table
ALTER TABLE connectors
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS auto_disabled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS failure_alert_sent BOOLEAN DEFAULT FALSE;

-- ─── SYNC RUN RECORDS (requirements spec name: sync_runs) ───────────────────
-- The spec calls this sync_runs but existing code uses connector_sync_log
-- Add a view alias and the missing columns
ALTER TABLE connector_sync_log
  ADD COLUMN IF NOT EXISTS records_fetched INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_created INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_updated INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS records_skipped INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_by VARCHAR(255);

CREATE OR REPLACE VIEW sync_runs AS
  SELECT
    id, connector_id,
    sync_started_at AS started_at,
    sync_completed_at AS finished_at,
    status,
    records_fetched,
    records_created,
    records_updated,
    records_skipped,
    error_message,
    sync_started_at AS created_at
  FROM connector_sync_log;

-- ─── APPEND-ONLY AUDIT LOG ENFORCEMENT ──────────────────────────────────────
-- Prevent deletes and updates on asset_audit_log
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log is append-only. Modifications are not permitted.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_delete ON asset_audit_log;
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE OR UPDATE ON asset_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- ─── SCHEDULED REPORTS TABLE ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id SERIAL PRIMARY KEY,
  report_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  report_type VARCHAR(100) NOT NULL, -- full_asset_list, risk_summary, connector_health, discovery
  format VARCHAR(20) NOT NULL DEFAULT 'csv', -- csv, pdf, excel
  schedule_cron VARCHAR(100) NOT NULL, -- e.g. '0 9 * * 1' = Monday 9am
  recipient_emails TEXT[] NOT NULL,
  filters JSONB, -- Optional filters (status, asset_type, risk_level etc.)
  is_active BOOLEAN DEFAULT TRUE,
  last_sent_at TIMESTAMP WITH TIME ZONE,
  next_send_at TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX (is_active),
  INDEX (next_send_at)
);

-- ─── RATE LIMIT LOG (for auth endpoint rate limiting) ───────────────────────
CREATE TABLE IF NOT EXISTS auth_rate_limit_log (
  id SERIAL PRIMARY KEY,
  ip_address INET NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  blocked BOOLEAN DEFAULT FALSE,
  
  INDEX (ip_address, attempt_at)
);

-- Auto-cleanup rate limit log older than 24 hours
CREATE OR REPLACE FUNCTION cleanup_rate_limit_log() RETURNS void AS $$
BEGIN
  DELETE FROM auth_rate_limit_log WHERE attempt_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- ─── CSV TEMPLATE FIELDS REFERENCE TABLE ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS csv_template_fields (
  id SERIAL PRIMARY KEY,
  field_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  field_type VARCHAR(50), -- text, date, enum, boolean, number
  required BOOLEAN DEFAULT FALSE,
  example_value VARCHAR(500),
  enum_values TEXT[], -- For enum fields
  sort_order INTEGER DEFAULT 0
);

-- Populate template fields
INSERT INTO csv_template_fields (field_name, display_name, description, field_type, required, example_value, sort_order)
VALUES
  ('asset_name', 'Asset Name', 'Human-readable display name', 'text', TRUE, 'LAPTOP-001', 1),
  ('asset_type', 'Asset Type', 'Type of asset', 'enum', TRUE, 'Laptop', 2),
  ('hostname', 'Hostname', 'DNS hostname', 'text', FALSE, 'laptop001.company.com', 3),
  ('ip_address', 'IP Address', 'Primary IP (IPv4 or IPv6)', 'text', FALSE, '192.168.1.100', 4),
  ('mac_address', 'MAC Address', 'Format: AA:BB:CC:DD:EE:FF', 'text', FALSE, 'AA:BB:CC:11:22:33', 5),
  ('os_name', 'OS Name', 'Operating system name', 'text', FALSE, 'Windows 11', 6),
  ('os_version', 'OS Version', 'OS version string', 'text', FALSE, '22H2', 7),
  ('manufacturer', 'Manufacturer', 'Hardware manufacturer', 'text', FALSE, 'Dell', 8),
  ('model', 'Model', 'Device model name', 'text', FALSE, 'Latitude 5540', 9),
  ('serial_number', 'Serial Number', 'Hardware serial number', 'text', FALSE, 'SN1234567', 10),
  ('owner_email', 'Owner Email', 'Primary owner email address', 'text', FALSE, 'user@company.com', 11),
  ('owner_name', 'Owner Name', 'Primary owner full name', 'text', FALSE, 'Jane Smith', 12),
  ('owner_team', 'Owner Team', 'Business unit or team', 'text', FALSE, 'Engineering', 13),
  ('location', 'Location', 'Site, building, room or rack', 'text', FALSE, 'HQ-Floor2-Rack3', 14),
  ('status', 'Status', 'Asset status', 'enum', FALSE, 'Active', 15),
  ('purchase_date', 'Purchase Date', 'Date asset was purchased (YYYY-MM-DD)', 'date', FALSE, '2023-01-15', 16),
  ('warranty_expiry', 'Warranty Expiry', 'Warranty expiration date (YYYY-MM-DD)', 'date', FALSE, '2026-01-15', 17),
  ('end_of_life_date', 'End of Life Date', 'Planned decommission date (YYYY-MM-DD)', 'date', FALSE, '2027-01-15', 18),
  ('tags', 'Tags', 'Comma-separated tags', 'text', FALSE, 'critical,finance,london', 19),
  ('notes', 'Notes', 'Freeform notes', 'text', FALSE, 'Replaced under warranty 2024', 20)
ON CONFLICT DO NOTHING;
