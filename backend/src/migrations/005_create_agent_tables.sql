-- Migration: 005_create_agent_tables
-- Adds tables for the remote agent / offline discovery system

-- ─── AGENTS TABLE ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id          SERIAL PRIMARY KEY,
  agent_id    VARCHAR(255) UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  site_name   VARCHAR(255) NOT NULL,       -- e.g. "London Office", "Factory Floor A"
  description TEXT,
  api_key     VARCHAR(255) UNIQUE NOT NULL, -- hashed with SHA-256 before storage
  api_key_prefix VARCHAR(12) NOT NULL,      -- first 12 chars shown in UI e.g. "agt_live_abc"
  status      VARCHAR(50)  NOT NULL DEFAULT 'Pending',
  -- Pending | Active | Offline | Disabled
  version     VARCHAR(50),                 -- agent binary version
  os_info     VARCHAR(255),                -- reported OS of the host machine
  ip_address  INET,                        -- last seen IP (outbound from agent)
  network_cidr VARCHAR(255),               -- CIDR the agent is configured to scan
  capabilities TEXT[] DEFAULT '{}',        -- ['icmp','tcp','nmap','snmp','http','pcap']
  last_heartbeat_at TIMESTAMP WITH TIME ZONE,
  last_job_at       TIMESTAMP WITH TIME ZONE,
  created_by  VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_agents_status    ON agents(status);
CREATE INDEX idx_agents_site_name ON agents(site_name);

-- ─── AGENT JOBS TABLE ─────────────────────────────────────────────────────────
-- A scan job routed to a specific agent instead of running in the backend.
-- The scan_id references the existing scans table.
CREATE TABLE IF NOT EXISTS agent_jobs (
  id          SERIAL PRIMARY KEY,
  job_id      VARCHAR(255) UNIQUE NOT NULL,
  agent_id    VARCHAR(255) NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  scan_id     VARCHAR(255),               -- FK to scans.scan_id (nullable for passive jobs)
  job_type    VARCHAR(50) NOT NULL,       -- 'active_scan' | 'passive_pcap' | 'passive_netflow'
  status      VARCHAR(50) NOT NULL DEFAULT 'Queued',
  -- Queued | Dispatched | Running | Complete | Failed | Cancelled
  payload     JSONB NOT NULL DEFAULT '{}', -- full scan config sent to agent
  result_summary JSONB,                   -- totals after completion
  error_message  TEXT,
  queued_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  dispatched_at  TIMESTAMP WITH TIME ZONE,  -- when agent picked it up
  started_at     TIMESTAMP WITH TIME ZONE,
  completed_at   TIMESTAMP WITH TIME ZONE,
  created_by  VARCHAR(255) NOT NULL,

  INDEX (agent_id),
  INDEX (status),
  INDEX (queued_at)
);

-- ─── AGENT HEARTBEATS TABLE ──────────────────────────────────────────────────
-- Rolling log of heartbeat pings from each agent (kept for 30 days)
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id          SERIAL PRIMARY KEY,
  agent_id    VARCHAR(255) NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address  INET,
  version     VARCHAR(50),
  status      VARCHAR(50),               -- 'idle' | 'running' | 'error'
  current_job_id VARCHAR(255),
  metrics     JSONB,                     -- cpu%, mem%, disk%, jobs_completed today

  INDEX (agent_id, received_at)
);

-- Auto-cleanup heartbeats older than 30 days
CREATE OR REPLACE FUNCTION cleanup_old_heartbeats() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM agent_heartbeats WHERE received_at < NOW() - INTERVAL '30 days';
END;
$$;

-- ─── OFFLINE BUFFER TABLE ────────────────────────────────────────────────────
-- Scan results submitted by agent when it reconnects after offline period
CREATE TABLE IF NOT EXISTS agent_result_buffer (
  id          SERIAL PRIMARY KEY,
  buffer_id   VARCHAR(255) UNIQUE NOT NULL,
  agent_id    VARCHAR(255) NOT NULL,
  job_id      VARCHAR(255),
  result_data JSONB NOT NULL,            -- array of scan result objects
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed   BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  error       TEXT,

  INDEX (agent_id),
  INDEX (processed)
);

-- ─── ADD agent_id COLUMN TO SCANS ────────────────────────────────────────────
-- NULL = run locally in backend, non-NULL = route to that agent
ALTER TABLE scans
  ADD COLUMN IF NOT EXISTS agent_id VARCHAR(255) REFERENCES agents(agent_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scans_agent_id ON scans(agent_id);
