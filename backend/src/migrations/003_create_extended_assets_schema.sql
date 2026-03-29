-- Migration: 003_create_extended_assets_schema
-- Create tables for extended asset types: API Keys, User Identities, and External Connections

-- ─── API KEYS & SECRETS TABLE ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(255) UNIQUE NOT NULL,
  key_name VARCHAR(255) NOT NULL,
  key_identifier VARCHAR(50), -- first 6 + last 4 chars only, e.g., "sk_live_••••••••••••Xk9f"
  secret_type VARCHAR(50) NOT NULL, -- API Key, OAuth Client Secret, Service Account Key, PAT, Webhook Secret, Signing Key, SSH Private Key, Certificate, Other
  platform VARCHAR(50) NOT NULL, -- AWS, Azure, GCP, GitHub, Stripe, Twilio, SendGrid, Custom, Other
  
  -- Ownership
  owner_team VARCHAR(255),
  owner_email VARCHAR(255),
  created_by VARCHAR(255) NOT NULL,
  approved_by VARCHAR(255),
  
  -- Lifecycle
  created_date TIMESTAMP WITH TIME ZONE,
  expiry_date TIMESTAMP WITH TIME ZONE,
  last_rotated_date TIMESTAMP WITH TIME ZONE,
  rotation_interval INTEGER, -- days
  next_rotation_due TIMESTAMP WITH TIME ZONE,
  auto_rotate BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) NOT NULL DEFAULT 'Active', -- Active, Expired, Revoked, Rotation Overdue, Unknown
  
  -- Usage & Scope
  associated_service VARCHAR(255),
  permission_scope TEXT, -- e.g., "read:users write:orders"
  environment VARCHAR(50), -- Production, Staging, Dev, Test
  where_stored VARCHAR(50), -- Vault, AWS Secrets Manager, Azure Key Vault, .env file, Code Repository, Hardcoded, Unknown
  exposed_in_code BOOLEAN DEFAULT FALSE,
  
  -- Risk
  risk_level VARCHAR(50) NOT NULL DEFAULT 'Low', -- Critical, High, Medium, Low
  last_used_date TIMESTAMP WITH TIME ZONE,
  usage_frequency VARCHAR(50), -- Daily, Weekly, Rarely, Never, Unknown
  
  -- Audit
  confidence_score SMALLINT DEFAULT 50,
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX (asset_id),
  INDEX (platform),
  INDEX (status),
  INDEX (risk_level),
  INDEX (created_at)
);

-- ─── USER IDENTITIES & ACCESS ENTITLEMENTS TABLE ───────────────────────────
CREATE TABLE IF NOT EXISTS user_identities (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  employee_id VARCHAR(255),
  user_type VARCHAR(50) NOT NULL DEFAULT 'Employee', -- Employee, Contractor, Service Account, Shared Account, Bot / Automation, External User
  department VARCHAR(255),
  manager_email VARCHAR(255),
  location VARCHAR(255),
  
  -- Account Details
  identity_provider VARCHAR(50), -- Active Directory, Azure AD, Okta, Google Workspace, JumpCloud, Local, Other
  account_status VARCHAR(50) NOT NULL DEFAULT 'Active', -- Active, Disabled, Locked, Suspended, Pending, Deleted
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_method VARCHAR(50), -- Authenticator App, SMS, Hardware Token, None
  password_last_set TIMESTAMP WITH TIME ZONE,
  password_expires TIMESTAMP WITH TIME ZONE,
  last_login_date TIMESTAMP WITH TIME ZONE,
  last_login_ip VARCHAR(45),
  failed_login_count INTEGER DEFAULT 0,
  account_created TIMESTAMP WITH TIME ZONE,
  account_expires TIMESTAMP WITH TIME ZONE,
  
  -- Entitlements
  group_memberships TEXT[], -- array of group names
  roles_assigned TEXT[], -- array of application roles
  privileged_access BOOLEAN DEFAULT FALSE,
  privileged_systems TEXT[], -- systems with elevated access
  licenses_assigned TEXT[], -- M365, GitHub, Jira, etc.
  
  -- Associated Assets (references to other asset IDs)
  assigned_devices TEXT[], -- device asset IDs
  owned_api_keys TEXT[], -- API key asset IDs
  
  -- Lifecycle
  onboarding_date TIMESTAMP WITH TIME ZONE,
  offboarding_date TIMESTAMP WITH TIME ZONE,
  access_review_due TIMESTAMP WITH TIME ZONE,
  last_access_review TIMESTAMP WITH TIME ZONE,
  
  -- Risk
  risk_level VARCHAR(50) NOT NULL DEFAULT 'Low', -- Critical, High, Medium, Low
  dormant BOOLEAN DEFAULT FALSE, -- no login in 90+ days
  orphaned BOOLEAN DEFAULT FALSE, -- employee left but account active
  
  -- Audit
  confidence_score SMALLINT DEFAULT 50,
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX (asset_id),
  INDEX (email),
  INDEX (username),
  INDEX (account_status),
  INDEX (risk_level),
  INDEX (orphaned),
  INDEX (dormant)
);

-- ─── EXTERNAL NETWORK CONNECTIONS TABLE ────────────────────────────────────
CREATE TABLE IF NOT EXISTS external_connections (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(255) UNIQUE NOT NULL,
  connection_name VARCHAR(255) NOT NULL,
  connection_type VARCHAR(50) NOT NULL, -- VPN (Site-to-Site), VPN (Remote Access), MPLS / Leased Line, SD-WAN, Direct Connect, Peering (BGP), Proxy, API Gateway, Third-Party, ISP Uplink, Other
  
  -- Endpoints
  local_endpoint VARCHAR(50), -- IP or subnet, e.g., 10.0.0.0/8
  remote_endpoint VARCHAR(255), -- IP, hostname, or CIDR
  remote_asn INTEGER,
  remote_owner VARCHAR(255), -- organisation name
  remote_country VARCHAR(255),
  
  -- Technical Details
  protocol VARCHAR(50), -- IPsec, SSL/TLS, MPLS, BGP, GRE, WireGuard, Other
  encryption VARCHAR(50), -- AES-256, AES-128, None, Unknown
  authentication VARCHAR(50), -- Pre-shared Key, Certificate, MFA, None
  bandwidth_mbps INTEGER,
  port_number INTEGER,
  firewall_rule_id VARCHAR(255),
  traffic_direction VARCHAR(50), -- Inbound, Outbound, Bidirectional
  
  -- Ownership & Purpose
  business_purpose TEXT,
  owner_team VARCHAR(255),
  approved_by VARCHAR(255),
  approved_date TIMESTAMP WITH TIME ZONE,
  contract_ref VARCHAR(255),
  provider VARCHAR(255), -- ISP or service provider
  
  -- Lifecycle
  established_date TIMESTAMP WITH TIME ZONE,
  review_date TIMESTAMP WITH TIME ZONE,
  expiry_date TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) NOT NULL DEFAULT 'Active', -- Active, Inactive, Degraded, Unauthorised, Under Review
  
  -- Monitoring
  last_seen TIMESTAMP WITH TIME ZONE,
  avg_latency_ms INTEGER,
  uptime_pct NUMERIC(5,2), -- 0-100 with 2 decimals
  bytes_in_30d BIGINT,
  bytes_out_30d BIGINT,
  alert_on_drop BOOLEAN DEFAULT FALSE,
  
  -- Risk
  risk_level VARCHAR(50) NOT NULL DEFAULT 'Low', -- Critical, High, Medium, Low
  encryption_in_transit BOOLEAN,
  split_tunnelling BOOLEAN DEFAULT FALSE,
  
  -- Audit
  confidence_score SMALLINT DEFAULT 50,
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX (asset_id),
  INDEX (status),
  INDEX (risk_level),
  INDEX (remote_owner),
  INDEX (created_at)
);

-- ─── ASSET RELATIONSHIPS TABLE ──────────────────────────────────────────────
-- Maps relationships between all asset types (devices, API keys, users, connections)
CREATE TABLE IF NOT EXISTS asset_relationships (
  id SERIAL PRIMARY KEY,
  relationship_id VARCHAR(255) UNIQUE NOT NULL,
  source_asset_id VARCHAR(255) NOT NULL,
  relationship_type VARCHAR(50) NOT NULL, -- used_by, owned_by, has_access_to, assigned_device, terminates_at, etc.
  target_asset_id VARCHAR(255) NOT NULL,
  metadata JSONB, -- optional extra data about the relationship
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255),
  
  INDEX (source_asset_id),
  INDEX (target_asset_id),
  INDEX (relationship_type),
  INDEX (relationship_id)
);

-- ─── ASSET ALERTS TABLE ────────────────────────────────────────────────────
-- Tracks alerts triggered by asset conditions (expiry, orphaned, unauthorized, etc.)
CREATE TABLE IF NOT EXISTS asset_alerts (
  id SERIAL PRIMARY KEY,
  alert_id VARCHAR(255) UNIQUE NOT NULL,
  asset_id VARCHAR(255) NOT NULL,
  asset_type VARCHAR(50) NOT NULL, -- API Key, User Identity, External Connection, Device
  alert_type VARCHAR(100) NOT NULL, -- Key expiring, Account orphaned, etc.
  severity VARCHAR(50) NOT NULL DEFAULT 'Medium', -- Critical, High, Medium, Low
  status VARCHAR(50) NOT NULL DEFAULT 'Active', -- Active, Acknowledged, Resolved
  owner_email VARCHAR(255),
  recommended_action TEXT,
  alert_details JSONB, -- extra context about why alert triggered
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  INDEX (asset_id),
  INDEX (severity),
  INDEX (status),
  INDEX (asset_type),
  INDEX (created_at)
);

-- ─── EXPOSED SECRETS REGISTRY TABLE ─────────────────────────────────────────
-- Records secrets discovered in code repositories
CREATE TABLE IF NOT EXISTS exposed_secrets (
  id SERIAL PRIMARY KEY,
  secret_id VARCHAR(255) UNIQUE NOT NULL,
  related_asset_id VARCHAR(255), -- link to api_keys record if matched
  repository_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  line_number INTEGER,
  commit_hash VARCHAR(255),
  detected_pattern_type VARCHAR(100), -- AWS Key, GitHub Token, API Key, etc.
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(50) NOT NULL DEFAULT 'Unreviewed', -- Unreviewed, Acknowledged, Remediated, False Positive
  remediation_notes TEXT,
  remediated_at TIMESTAMP WITH TIME ZONE,
  
  INDEX (related_asset_id),
  INDEX (status),
  INDEX (detected_at)
);

-- ─── Add foreign key constraints ────────────────────────────────────────────
ALTER TABLE asset_relationships
ADD CONSTRAINT fk_asset_rel_source
FOREIGN KEY (source_asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE;

ALTER TABLE asset_relationships
ADD CONSTRAINT fk_asset_rel_target
FOREIGN KEY (target_asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE;

ALTER TABLE asset_alerts
ADD CONSTRAINT fk_alert_asset
FOREIGN KEY (asset_id) REFERENCES assets(asset_id) ON DELETE CASCADE;

ALTER TABLE exposed_secrets
ADD CONSTRAINT fk_secret_api_key
FOREIGN KEY (related_asset_id) REFERENCES assets(asset_id) ON DELETE SET NULL;
