-- Restore Platform — PostgreSQL 16 Schema
-- RESTORE-SDD-001 v1.1 Lean MVP

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Live schema ─────────────────────────────────────────────────────────────

-- Users & sessions (IdP-federated; mirrored locally)
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  idp_subject   TEXT UNIQUE,              -- SAML/OIDC sub claim
  tier          TEXT NOT NULL CHECK (tier IN ('BRONZE','SILVER','GOLD','AUTHOR','ADMIN')),
  roles         TEXT[] NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

-- Technology Assets
CREATE TABLE assets (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  asset_type       TEXT NOT NULL,          -- SERVER, DATABASE, NETWORK, CLOUD_SERVICE, SAAS, API, etc.
  environment      TEXT NOT NULL DEFAULT 'PRODUCTION' CHECK (environment IN ('PRODUCTION','STAGING','DR','DEV')),
  owner            TEXT,
  criticality_tier INTEGER NOT NULL DEFAULT 2 CHECK (criticality_tier BETWEEN 1 AND 4),
  location         TEXT,
  recovery_group   TEXT,
  status           TEXT NOT NULL DEFAULT 'HEALTHY' CHECK (status IN ('HEALTHY','DEGRADED','CRITICAL','OFFLINE','UNKNOWN')),
  last_health_update TIMESTAMPTZ,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX assets_status_idx ON assets(status);
CREATE INDEX assets_criticality_idx ON assets(criticality_tier);

-- Dependency graph (adjacency list — upgradeable to Neo4j later)
CREATE TABLE asset_dependencies (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_asset_id   UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  target_asset_id   UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('HOSTS','REQUIRES','CONSUMES','REPLICATES_TO','LOAD_BALANCES')),
  effective_from    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to      TIMESTAMPTZ,
  changed_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_asset_id, target_asset_id, relationship_type)
);
CREATE INDEX asset_deps_source_idx ON asset_dependencies(source_asset_id);
CREATE INDEX asset_deps_target_idx ON asset_dependencies(target_asset_id);

-- Business Services
CREATE TABLE business_services (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL UNIQUE,
  business_unit     TEXT NOT NULL,
  impact_tier       INTEGER NOT NULL DEFAULT 2 CHECK (impact_tier BETWEEN 1 AND 4),
  rto_minutes       INTEGER NOT NULL DEFAULT 240,
  rta_minutes       INTEGER,
  status            TEXT NOT NULL DEFAULT 'OPERATIONAL' CHECK (status IN ('OPERATIONAL','DEGRADED','PARTIALLY_IMPACTED','DOWN','RECOVERING','RESTORED')),
  status_updated_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE business_service_assets (
  business_service_id UUID NOT NULL REFERENCES business_services(id) ON DELETE CASCADE,
  asset_id            UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  PRIMARY KEY (business_service_id, asset_id)
);

-- Connectors (runbook sources)
CREATE TABLE connectors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  connector_type  TEXT NOT NULL CHECK (connector_type IN ('GITHUB','CONFLUENCE','SHAREPOINT','MEDIAWIKI','PDF','HTTP')),
  config          JSONB NOT NULL DEFAULT '{}',     -- endpoint, paths, etc (no credentials)
  credential_ref  TEXT,                             -- reference to env var or secrets store key
  sync_schedule   TEXT NOT NULL DEFAULT '0 */6 * * *',
  last_synced_at  TIMESTAMPTZ,
  last_sync_status TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Runbooks (cached from connectors)
CREATE TABLE runbooks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connector_id    UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  source_ref      TEXT NOT NULL,                   -- path/URL/page-id at source
  title           TEXT NOT NULL,
  content_text    TEXT NOT NULL,                   -- normalised plain text
  content_hash    TEXT NOT NULL,                   -- SHA-256 for change detection
  event_tags      TEXT[] NOT NULL DEFAULT '{}',    -- e.g. ['RANSOMWARE','DDoS']
  service_tags    TEXT[] NOT NULL DEFAULT '{}',
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ttl_expires_at  TIMESTAMPTZ,
  storage_key     TEXT,                            -- object storage key for raw doc
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(connector_id, source_ref)
);
CREATE INDEX runbooks_event_tags_idx ON runbooks USING GIN(event_tags);
CREATE INDEX runbooks_service_tags_idx ON runbooks USING GIN(service_tags);

-- Recovery Events
CREATE TABLE recovery_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             TEXT NOT NULL,
  event_type        TEXT NOT NULL,                 -- RANSOMWARE, INFRASTRUCTURE_FAILURE, DR_ACTIVATION, etc.
  severity          TEXT NOT NULL CHECK (severity IN ('P1','P2','P3','P4')),
  status            TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED','REHEARSAL')),
  affected_service_ids UUID[] NOT NULL DEFAULT '{}',
  blast_radius      JSONB,                          -- snapshot of blast radius at initiation
  opened_by         UUID REFERENCES users(id),
  commander_id      UUID REFERENCES users(id),
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  notes             TEXT,
  ml_severity_score NUMERIC(4,3),
  is_rehearsal      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX events_status_idx ON recovery_events(status);
CREATE INDEX events_opened_at_idx ON recovery_events(opened_at);
CREATE INDEX events_is_rehearsal_idx ON recovery_events(is_rehearsal);

-- Sequences of Events
CREATE TABLE soes (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id                   UUID NOT NULL REFERENCES recovery_events(id) ON DELETE CASCADE,
  scope_type                 TEXT NOT NULL DEFAULT 'FULL_ORG' CHECK (scope_type IN ('FULL_ORG','BUSINESS_SERVICE')),
  scope_service_id           UUID REFERENCES business_services(id),
  status                     TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED')),
  total_estimated_minutes    INTEGER,
  ml_ttfr_minutes            INTEGER,
  ml_ttfr_confidence_low     INTEGER,
  ml_ttfr_confidence_high    INTEGER,
  recovery_confidence_score  NUMERIC(4,3),
  generated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at               TIMESTAMPTZ,
  completed_at               TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SOE Phases
CREATE TABLE soe_phases (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  soe_id      UUID NOT NULL REFERENCES soes(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sequence    INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SOE Steps
CREATE TABLE soe_steps (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  soe_id                     UUID NOT NULL REFERENCES soes(id) ON DELETE CASCADE,
  phase_id                   UUID REFERENCES soe_phases(id),
  sequence                   INTEGER NOT NULL,
  name                       TEXT NOT NULL,
  description                TEXT NOT NULL,
  step_type                  TEXT NOT NULL DEFAULT 'HUMAN' CHECK (step_type IN ('HUMAN','AUTOMATED')),
  swim_lane                  TEXT,
  assigned_to                UUID REFERENCES users(id),
  estimated_duration_minutes INTEGER,
  ml_predicted_duration_minutes INTEGER,
  confidence_score           NUMERIC(4,3),
  runbook_id                 UUID REFERENCES runbooks(id),
  runbook_citation           TEXT,
  dependencies               UUID[] NOT NULL DEFAULT '{}',       -- step IDs
  is_on_critical_path        BOOLEAN NOT NULL DEFAULT FALSE,
  float_minutes              INTEGER,
  status                     TEXT NOT NULL DEFAULT 'NOT_STARTED'
                               CHECK (status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','SKIPPED','BLOCKED')),
  skipped_reason             TEXT,
  blocked_reason             TEXT,
  started_at                 TIMESTAMPTZ,
  completed_at               TIMESTAMPTZ,
  automation_config          JSONB,                               -- soarPlaybookId, approvalRequired
  requires_approval          BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by                UUID REFERENCES users(id),
  approved_at                TIMESTAMPTZ,
  ml_missing_step_flag       BOOLEAN NOT NULL DEFAULT FALSE,
  ml_missing_step_confidence NUMERIC(4,3),
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX steps_soe_id_idx ON soe_steps(soe_id);
CREATE INDEX steps_status_idx ON soe_steps(status);
CREATE INDEX steps_assigned_idx ON soe_steps(assigned_to);

-- Evidence
CREATE TABLE evidence (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  step_id      UUID NOT NULL REFERENCES soe_steps(id) ON DELETE CASCADE,
  event_id     UUID NOT NULL REFERENCES recovery_events(id),
  uploaded_by  UUID NOT NULL REFERENCES users(id),
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('NOTE','FILE','LOG','SCREENSHOT')),
  title        TEXT,
  content      TEXT,                                              -- for notes/logs
  storage_key  TEXT,                                             -- for files
  file_name    TEXT,
  file_size    INTEGER,
  mime_type    TEXT,
  scan_status  TEXT DEFAULT 'PENDING' CHECK (scan_status IN ('PENDING','CLEAN','QUARANTINED','SKIPPED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX evidence_step_id_idx ON evidence(step_id);

-- Escalations
CREATE TABLE escalations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id       UUID NOT NULL REFERENCES recovery_events(id),
  step_id        UUID REFERENCES soe_steps(id),
  raised_by      UUID NOT NULL REFERENCES users(id),
  severity       TEXT NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  description    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  resolved_by    UUID REFERENCES users(id),
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rehearsals
CREATE TABLE rehearsals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL,
  soe_template_id   UUID,
  event_type        TEXT NOT NULL,
  scheduled_at      TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','IN_PROGRESS','COMPLETED','CANCELLED')),
  created_by        UUID REFERENCES users(id),
  commander_id      UUID REFERENCES users(id),
  recovery_event_id UUID REFERENCES recovery_events(id),    -- linked sandboxed event
  assessment_report JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rehearsal_participants (
  rehearsal_id UUID NOT NULL REFERENCES rehearsals(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (rehearsal_id, user_id)
);

-- Lessons learned
CREATE TABLE lessons_learned (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      UUID REFERENCES recovery_events(id),
  rehearsal_id  UUID REFERENCES rehearsals(id),
  step_id       UUID REFERENCES soe_steps(id),
  submitted_by  UUID NOT NULL REFERENCES users(id),
  category      TEXT NOT NULL CHECK (category IN ('RUNBOOK_GAP','PROCESS_ISSUE','TOOL_ISSUE','TRAINING','OTHER')),
  description   TEXT NOT NULL,
  assigned_to   UUID REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','IN_REVIEW','ACTIONED','CLOSED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Append-only Audit Log ────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence      BIGSERIAL UNIQUE NOT NULL,
  event_id      UUID,
  user_id       UUID,
  user_tier     TEXT,
  action        TEXT NOT NULL,
  object_type   TEXT,
  object_id     UUID,
  before_state  JSONB,
  after_state   JSONB,
  ip_address    INET,
  user_agent    TEXT,
  previous_hash TEXT,
  entry_hash    TEXT NOT NULL,
  is_rehearsal  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_event_id_idx ON audit_log(event_id);
CREATE INDEX audit_user_id_idx ON audit_log(user_id);
CREATE INDEX audit_created_at_idx ON audit_log(created_at);
CREATE INDEX audit_action_idx ON audit_log(action);

-- Prevent UPDATE and DELETE on audit_log
CREATE OR REPLACE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- ─── Background Jobs Table ─────────────────────────────────────────────────
CREATE TABLE jobs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type       TEXT NOT NULL,
  payload        JSONB NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED','DEAD')),
  priority       INTEGER NOT NULL DEFAULT 5,
  attempts       INTEGER NOT NULL DEFAULT 0,
  max_attempts   INTEGER NOT NULL DEFAULT 3,
  run_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  failed_at      TIMESTAMPTZ,
  error_message  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX jobs_status_run_at_idx ON jobs(status, run_at) WHERE status IN ('PENDING','FAILED');
CREATE INDEX jobs_type_idx ON jobs(job_type);

-- ─── LISTEN/NOTIFY triggers for real-time SSE ─────────────────────────────
CREATE OR REPLACE FUNCTION notify_step_changed() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    'step_changed',
    json_build_object(
      'stepId', NEW.id,
      'soeId', NEW.soe_id,
      'status', NEW.status,
      'assignedTo', NEW.assigned_to
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER step_changed_trigger
  AFTER INSERT OR UPDATE ON soe_steps
  FOR EACH ROW EXECUTE FUNCTION notify_step_changed();

CREATE OR REPLACE FUNCTION notify_asset_health_changed() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM pg_notify(
      'asset_health_changed',
      json_build_object('assetId', NEW.id, 'status', NEW.status)::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER asset_health_trigger
  AFTER UPDATE ON assets
  FOR EACH ROW EXECUTE FUNCTION notify_asset_health_changed();

-- ─── Rehearsal schema (isolated) ─────────────────────────────────────────────
CREATE SCHEMA rehearsal;

CREATE TABLE rehearsal.mock_soar_calls (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rehearsal_id UUID NOT NULL,
  step_id      UUID NOT NULL,
  playbook_id  TEXT,
  mock_result  JSONB NOT NULL DEFAULT '{"status":"success"}',
  called_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rehearsal.notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rehearsal_id UUID NOT NULL,
  recipient    TEXT NOT NULL,
  channel      TEXT NOT NULL,
  subject      TEXT,
  body         TEXT,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Helper functions ─────────────────────────────────────────────────────────

-- Recursive blast radius traversal using adjacency list
CREATE OR REPLACE FUNCTION get_blast_radius(start_asset_id UUID)
RETURNS TABLE(asset_id UUID, depth INTEGER, path UUID[]) AS $$
WITH RECURSIVE traversal AS (
  SELECT
    a.id AS asset_id,
    1 AS depth,
    ARRAY[a.id] AS path
  FROM assets a
  WHERE a.id = start_asset_id

  UNION ALL

  SELECT
    dep.target_asset_id,
    t.depth + 1,
    t.path || dep.target_asset_id
  FROM asset_dependencies dep
  JOIN traversal t ON dep.source_asset_id = t.asset_id
  WHERE NOT dep.target_asset_id = ANY(t.path)
    AND t.depth < 10
)
SELECT DISTINCT asset_id, MIN(depth) as depth, MIN(path) as path
FROM traversal
GROUP BY asset_id;
$$ LANGUAGE SQL STABLE;

-- updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON business_services FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON recovery_events FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON soes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON soe_steps FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON connectors FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON runbooks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
