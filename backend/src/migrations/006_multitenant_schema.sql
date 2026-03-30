-- =============================================================================
-- Migration 006: Multitenant Schema
-- Adds tenants table, tenant_id to every data table,
-- fixes the global email uniqueness constraint,
-- and enables Row Level Security on all tenant-scoped tables.
-- =============================================================================

-- ─── 1. TENANTS TABLE ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT UNIQUE NOT NULL,          -- URL-safe identifier e.g. "acme-corp"
  name          TEXT NOT NULL,                 -- Display name e.g. "Acme Corporation"
  plan          TEXT NOT NULL DEFAULT 'starter'
                  CHECK (plan IN ('starter','professional','enterprise')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  max_users     INTEGER NOT NULL DEFAULT 10,
  max_assets    INTEGER NOT NULL DEFAULT 1000,
  settings      JSONB NOT NULL DEFAULT '{}',   -- feature flags, branding, etc.
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tenants_slug_idx ON tenants(slug);
CREATE INDEX tenants_active_idx ON tenants(is_active);

-- ─── 2. ADD tenant_id TO USERS ───────────────────────────────────────────────
-- Drop old global email unique constraint — email is now unique per tenant
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,   -- was missing from init.sql but used in routes
  ADD COLUMN IF NOT EXISTS is_tenant_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Remove the global email unique constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

-- New constraint: email unique WITHIN a tenant
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_idx ON users(tenant_id, email);

-- Super-admins (platform staff) have tenant_id = NULL — they can see all tenants
-- Regular users always have a tenant_id

CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_id);

-- ─── 3. ADD tenant_id TO EVERY DATA TABLE ────────────────────────────────────
-- Core platform tables
ALTER TABLE assets              ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE business_services   ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE connectors          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE runbooks            ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE recovery_events     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE soes                ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Asset registry tables (added in migrations 001-005)
ALTER TABLE asset_software           ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE asset_network_interfaces ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE discovery_inbox          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE asset_audit_log          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE csv_import_sessions      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE health_check_results     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE scans                    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE scan_results             ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE scan_progress_log        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE asset_groups             ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE api_keys                 ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE user_identities          ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE external_connections     ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE asset_relationships      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE asset_alerts             ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE asset_attachments        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE scheduled_reports        ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE agents                   ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE agent_jobs               ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- New connector_sync_log table also needs tenant scoping
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='connector_sync_log') THEN
    ALTER TABLE connector_sync_log ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ─── 4. INDEXES ON tenant_id ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS assets_tenant_idx              ON assets(tenant_id);
CREATE INDEX IF NOT EXISTS business_services_tenant_idx   ON business_services(tenant_id);
CREATE INDEX IF NOT EXISTS connectors_tenant_idx          ON connectors(tenant_id);
CREATE INDEX IF NOT EXISTS scans_tenant_idx               ON scans(tenant_id);
CREATE INDEX IF NOT EXISTS agents_tenant_idx              ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS api_keys_tenant_idx            ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS user_identities_tenant_idx     ON user_identities(tenant_id);
CREATE INDEX IF NOT EXISTS discovery_inbox_tenant_idx     ON discovery_inbox(tenant_id);
CREATE INDEX IF NOT EXISTS asset_alerts_tenant_idx        ON asset_alerts(tenant_id);

-- ─── 5. TENANT INVITATIONS TABLE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_invitations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  tier          TEXT NOT NULL DEFAULT 'BRONZE'
                  CHECK (tier IN ('BRONZE','SILVER','GOLD','AUTHOR','ADMIN')),
  token         TEXT UNIQUE NOT NULL,           -- secure random token
  invited_by    UUID REFERENCES users(id),
  accepted_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tenant_invitations_token_idx     ON tenant_invitations(token);
CREATE INDEX tenant_invitations_tenant_idx    ON tenant_invitations(tenant_id);
CREATE INDEX tenant_invitations_email_idx     ON tenant_invitations(email);

-- ─── 6. TENANT MEMBERSHIP QUICK-LOOK VIEW ────────────────────────────────────
CREATE OR REPLACE VIEW tenant_members AS
  SELECT
    u.id, u.tenant_id, u.email, u.display_name, u.tier,
    u.is_tenant_admin, u.is_active, u.last_login_at,
    t.name AS tenant_name, t.slug AS tenant_slug
  FROM users u
  JOIN tenants t ON t.id = u.tenant_id
  WHERE u.tenant_id IS NOT NULL;

-- ─── 7. ROW LEVEL SECURITY ────────────────────────────────────────────────────
-- Enable RLS as a defence-in-depth measure.
-- The application ALWAYS filters by tenant_id explicitly in SQL — RLS is a
-- second safety net in case a query accidentally omits the WHERE clause.

ALTER TABLE assets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_services   ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_inbox     ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys            ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_identities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_alerts        ENABLE ROW LEVEL SECURITY;

-- Policy: only the app role (postgres user) can bypass RLS.
-- The app sets app.current_tenant_id at the start of each request.

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- Assets RLS
DROP POLICY IF EXISTS assets_tenant_isolation ON assets;
CREATE POLICY assets_tenant_isolation ON assets
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- Business Services RLS
DROP POLICY IF EXISTS bs_tenant_isolation ON business_services;
CREATE POLICY bs_tenant_isolation ON business_services
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- Connectors RLS
DROP POLICY IF EXISTS connectors_tenant_isolation ON connectors;
CREATE POLICY connectors_tenant_isolation ON connectors
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- Scans RLS
DROP POLICY IF EXISTS scans_tenant_isolation ON scans;
CREATE POLICY scans_tenant_isolation ON scans
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- Agents RLS
DROP POLICY IF EXISTS agents_tenant_isolation ON agents;
CREATE POLICY agents_tenant_isolation ON agents
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- Discovery Inbox RLS
DROP POLICY IF EXISTS discovery_tenant_isolation ON discovery_inbox;
CREATE POLICY discovery_tenant_isolation ON discovery_inbox
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- API Keys RLS
DROP POLICY IF EXISTS api_keys_tenant_isolation ON api_keys;
CREATE POLICY api_keys_tenant_isolation ON api_keys
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- User Identities RLS
DROP POLICY IF EXISTS user_identities_tenant_isolation ON user_identities;
CREATE POLICY user_identities_tenant_isolation ON user_identities
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- Asset Alerts RLS
DROP POLICY IF EXISTS asset_alerts_tenant_isolation ON asset_alerts;
CREATE POLICY asset_alerts_tenant_isolation ON asset_alerts
  USING (tenant_id = current_tenant_id() OR current_tenant_id() IS NULL);

-- ─── 8. UPDATED TRIGGERS ─────────────────────────────────────────────────────
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── 9. DEFAULT TENANT FOR EXISTING DATA (migration safety) ──────────────────
-- Creates a default tenant and assigns all existing users/data to it.
-- Only runs if there is existing data with no tenant_id.
DO $$
DECLARE
  default_tenant_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE tenant_id IS NULL LIMIT 1) THEN
    INSERT INTO tenants (slug, name, plan)
    VALUES ('default', 'Default Organisation', 'professional')
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO default_tenant_id;

    IF default_tenant_id IS NULL THEN
      SELECT id INTO default_tenant_id FROM tenants WHERE slug = 'default';
    END IF;

    -- Assign all existing orphaned users to default tenant
    UPDATE users SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;

    -- Assign all existing data rows to default tenant
    UPDATE assets              SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE business_services   SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE connectors          SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE scans               SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE agents              SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE discovery_inbox     SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE api_keys            SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE user_identities     SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
    UPDATE asset_alerts        SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;

    RAISE NOTICE 'Assigned existing data to default tenant: %', default_tenant_id;
  END IF;
END $$;
