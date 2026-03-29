# Implementation Plan: Extended Asset Registry

## Overview
Extend the IT Asset Registry to include three new first-class asset types:
1. **API Keys & Secrets** - Cryptographic credentials and tokens
2. **User Identities & Access Entitlements** - People, accounts, and access rights
3. **External Network Connections** - VPNs, peering, direct connections

All three types integrate with existing Asset Registry features (discovery, scanning, reporting, relationships).

---

## PHASE 1: DATABASE SCHEMA EXTENSION

### Phase 1a: Create New Tables

**Files:**
- `backend/src/migrations/003_create_extended_assets_schema.sql` - NEW

**Tables to Create:**

```sql
-- API Keys & Secrets
CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(255) UNIQUE NOT NULL,
  key_name VARCHAR(255) NOT NULL,
  key_identifier VARCHAR(50), -- first 6 + last 4 only
  secret_type VARCHAR(50), -- API Key, OAuth, PAT, etc.
  platform VARCHAR(50), -- AWS, Azure, GitHub, etc.
  
  -- Ownership
  owner_team VARCHAR(255),
  owner_email VARCHAR(255),
  created_by VARCHAR(255),
  approved_by VARCHAR(255),
  
  -- Lifecycle
  created_date TIMESTAMP,
  expiry_date TIMESTAMP,
  last_rotated_date TIMESTAMP,
  rotation_interval INTEGER, -- days
  next_rotation_due TIMESTAMP,
  auto_rotate BOOLEAN DEFAULT FALSE,
  status VARCHAR(50), -- Active, Expired, Revoked, etc.
  
  -- Usage & Scope
  associated_service VARCHAR(255),
  permission_scope TEXT,
  environment VARCHAR(50), -- Production, Staging, Dev
  where_stored VARCHAR(50), -- Vault, .env, Code, etc.
  exposed_in_code BOOLEAN DEFAULT FALSE,
  
  -- Risk
  risk_level VARCHAR(50), -- Critical, High, Medium, Low
  last_used_date TIMESTAMP,
  usage_frequency VARCHAR(50),
  
  -- Audit
  confidence_score SMALLINT DEFAULT 0,
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (asset_id),
  INDEX (platform),
  INDEX (status),
  INDEX (risk_level)
);

-- User Identities & Access Entitlements
CREATE TABLE user_identities (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  employee_id VARCHAR(255),
  user_type VARCHAR(50), -- Employee, Contractor, Service Account, etc.
  department VARCHAR(255),
  manager_email VARCHAR(255),
  location VARCHAR(255),
  
  -- Account Details
  identity_provider VARCHAR(50), -- AD, Azure AD, Okta, etc.
  account_status VARCHAR(50), -- Active, Disabled, Locked, etc.
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_method VARCHAR(50), -- Authenticator, SMS, Hardware, None
  password_last_set TIMESTAMP,
  password_expires TIMESTAMP,
  last_login_date TIMESTAMP,
  last_login_ip VARCHAR(45),
  failed_login_count INTEGER DEFAULT 0,
  account_created TIMESTAMP,
  account_expires TIMESTAMP,
  
  -- Entitlements
  group_memberships TEXT[], -- array of group names
  roles_assigned TEXT[], -- array of role names
  privileged_access BOOLEAN DEFAULT FALSE,
  privileged_systems TEXT[], -- systems with elevated access
  licenses_assigned TEXT[], -- M365, GitHub, Jira, etc.
  
  -- Associated Assets (FK references)
  assigned_devices TEXT[], -- array of device asset IDs
  owned_api_keys TEXT[], -- array of API key asset IDs
  
  -- Lifecycle
  onboarding_date TIMESTAMP,
  offboarding_date TIMESTAMP,
  access_review_due TIMESTAMP,
  last_access_review TIMESTAMP,
  
  -- Risk
  risk_level VARCHAR(50),
  dormant BOOLEAN DEFAULT FALSE,
  orphaned BOOLEAN DEFAULT FALSE,
  
  -- Audit
  confidence_score SMALLINT DEFAULT 0,
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (asset_id),
  INDEX (email),
  INDEX (account_status),
  INDEX (risk_level),
  INDEX (orphaned)
);

-- External Network Connections
CREATE TABLE external_connections (
  id SERIAL PRIMARY KEY,
  asset_id VARCHAR(255) UNIQUE NOT NULL,
  connection_name VARCHAR(255) NOT NULL,
  connection_type VARCHAR(50), -- VPN, MPLS, Direct Connect, etc.
  
  -- Endpoints
  local_endpoint VARCHAR(50), -- IP or CIDR
  remote_endpoint VARCHAR(255), -- IP, hostname, or CIDR
  remote_asn INTEGER,
  remote_owner VARCHAR(255),
  remote_country VARCHAR(255),
  
  -- Technical Details
  protocol VARCHAR(50), -- IPsec, SSL/TLS, BGP, etc.
  encryption VARCHAR(50), -- AES-256, AES-128, None
  authentication VARCHAR(50), -- PSK, Certificate, MFA, None
  bandwidth_mbps INTEGER,
  port_number INTEGER,
  firewall_rule_id VARCHAR(255),
  traffic_direction VARCHAR(50), -- Inbound, Outbound, Bidirectional
  
  -- Ownership & Purpose
  business_purpose TEXT,
  owner_team VARCHAR(255),
  approved_by VARCHAR(255),
  approved_date TIMESTAMP,
  contract_ref VARCHAR(255),
  provider VARCHAR(255),
  
  -- Lifecycle
  established_date TIMESTAMP,
  review_date TIMESTAMP,
  expiry_date TIMESTAMP,
  status VARCHAR(50), -- Active, Inactive, Degraded, Unauthorised
  
  -- Monitoring
  last_seen TIMESTAMP,
  avg_latency_ms INTEGER,
  uptime_pct NUMERIC(5,2),
  bytes_in_30d BIGINT,
  bytes_out_30d BIGINT,
  alert_on_drop BOOLEAN DEFAULT FALSE,
  
  -- Risk
  risk_level VARCHAR(50),
  encryption_in_transit BOOLEAN,
  split_tunnelling BOOLEAN DEFAULT FALSE,
  
  -- Audit
  confidence_score SMALLINT DEFAULT 0,
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  INDEX (asset_id),
  INDEX (status),
  INDEX (risk_level),
  INDEX (remote_owner)
);

-- Asset Relationships
CREATE TABLE asset_relationships (
  id SERIAL PRIMARY KEY,
  source_asset_id VARCHAR(255) NOT NULL,
  relationship_type VARCHAR(50), -- used_by, owned_by, has_access_to, etc.
  target_asset_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),
  
  INDEX (source_asset_id),
  INDEX (target_asset_id),
  INDEX (relationship_type)
);

-- Extended Alerts
CREATE TABLE asset_alerts (
  id SERIAL PRIMARY KEY,
  alert_id VARCHAR(255) UNIQUE NOT NULL,
  asset_id VARCHAR(255) NOT NULL,
  alert_type VARCHAR(100), -- Key expiring, Account orphaned, etc.
  severity VARCHAR(50), -- Critical, High, Medium, Low
  status VARCHAR(50), -- Active, Acknowledged, Resolved
  owner_email VARCHAR(255),
  recommended_action TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP,
  
  INDEX (asset_id),
  INDEX (severity),
  INDEX (status)
);
```

**Duration:** ~2 hours

---

## PHASE 2: BACKEND TYPES & SCHEMAS

### Phase 2a: Extend types.ts

**Files:**
- `backend/src/modules/asset-registry/types.ts` - EXTEND

**Add:**
- `ApiKey` interface with all fields
- `UserIdentity` interface with all fields
- `ExternalConnection` interface with all fields
- `AssetRelationship` interface
- `AssetAlert` interface
- Enums: `SecretType`, `Platform`, `IdentityProvider`, `ConnectionType`, `RiskLevel`, `RelationshipType`

**Duration:** ~1 hour

---

## PHASE 3: RISK AUTO-CALCULATION ENGINE

### Phase 3a: Create Risk Calculator Service

**Files:**
- `backend/src/modules/asset-registry/risk-calculator.ts` - NEW

**Implement:**

```typescript
class RiskCalculator {
  // API Keys
  calculateApiKeyRisk(key: ApiKey): RiskLevel
  
  // User Identities
  calculateUserRisk(user: UserIdentity): RiskLevel
  
  // External Connections
  calculateConnectionRisk(conn: ExternalConnection): RiskLevel
}
```

Each method:
- Evaluates all risk conditions (Critical, High, Medium, Low)
- Returns risk level + array of reasons (for tooltip)
- Called on every create/update

**Duration:** ~2-3 hours

---

## PHASE 4: BACKEND API ENDPOINTS

### Phase 4a: CRUD Endpoints for Each Type

**Files:**
- `backend/src/modules/asset-registry/routes.ts` - EXTEND

**Add endpoints for each type:**

```
// API Keys
POST   /api/v1/api-keys
GET    /api/v1/api-keys
GET    /api/v1/api-keys/:id
PUT    /api/v1/api-keys/:id
DELETE /api/v1/api-keys/:id

// User Identities
POST   /api/v1/users
GET    /api/v1/users
GET    /api/v1/users/:id
PUT    /api/v1/users/:id
DELETE /api/v1/users/:id

// External Connections
POST   /api/v1/connections
GET    /api/v1/connections
GET    /api/v1/connections/:id
PUT    /api/v1/connections/:id
DELETE /api/v1/connections/:id

// Relationships
POST   /api/v1/relationships
GET    /api/v1/relationships
DELETE /api/v1/relationships/:id

// Alerts
GET    /api/v1/alerts
POST   /api/v1/alerts/:id/acknowledge
POST   /api/v1/alerts/:id/resolve
```

**Duration:** ~3-4 hours

---

## PHASE 5: DISCOVERY & CONNECTORS

### Phase 5a: Connector Presets for Each Type

**Files:**
- `backend/src/modules/asset-registry/connectors/secrets-manager.ts` - NEW (AWS, Azure, Vault)
- `backend/src/modules/asset-registry/connectors/directory.ts` - NEW (AD, Okta, Google)
- `backend/src/modules/asset-registry/connectors/firewall.ts` - NEW (Palo Alto, Cisco)
- `backend/src/modules/asset-registry/connectors/cloud-network.ts` - NEW (AWS, Azure)

**Each implements:**
- Authentication (OAuth2, API Key, etc.)
- Data fetching with pagination
- Field mapping to asset schema
- Error handling and logging

**Duration:** ~8-10 hours (one per type + cloud providers)

### Phase 5b: Passive Discovery

**Files:**
- `backend/src/modules/asset-registry/discovery/secrets-scanner.ts` - NEW (git secrets)
- `backend/src/modules/asset-registry/discovery/network-analyzer.ts` - NEW (unauthorized connections)

**Duration:** ~4-5 hours

---

## PHASE 6: FRONTEND - ASSET CREATION & MANAGEMENT

### Phase 6a: Create UI Pages

**Files:**
- `apps/web/src/pages/silver/ApiKeysPage.tsx` - NEW
- `apps/web/src/pages/silver/UserIdentitiesPage.tsx` - NEW
- `apps/web/src/pages/silver/ExternalConnectionsPage.tsx` - NEW

**Each includes:**
- List view with type-specific columns
- Create/Edit modal with form validation
- Filter and search
- Bulk actions
- Back button navigation

**Duration:** ~6-8 hours

### Phase 6b: Update Main Asset List

**Files:**
- `apps/web/src/pages/silver/AssetRegistryPage.tsx` - EXTEND

**Changes:**
- Add asset type filter (All | Devices | API Keys | Users | Connections)
- Dynamic columns based on selected type
- Update add asset dropdown menu

**Duration:** ~2-3 hours

---

## PHASE 7: RISK DASHBOARD

### Phase 7a: Risk Overview Dashboard

**Files:**
- `apps/web/src/pages/silver/RiskDashboardPage.tsx` - NEW

**Shows:**
- Risk summary cards (Critical, High, Medium, Low counts)
- Risk breakdown by type (stacked bar chart)
- Priority action list (top 10)
- Filtering by type and risk level

**Duration:** ~3-4 hours

---

## PHASE 8: ASSET DETAIL & RELATIONSHIPS

### Phase 8a: Extend Asset Detail Page

**Files:**
- `apps/web/src/pages/silver/AssetDetailPage.tsx` - EXTEND

**Add:**
- Type-specific fields and tabs for each asset type
- Related Assets tab showing linked assets
- Risk reason tooltip
- Edit capability for each type

**Duration:** ~3-4 hours

---

## PHASE 9: ALERTS & NOTIFICATIONS

### Phase 9a: Alert Engine Integration

**Files:**
- `backend/src/modules/asset-registry/alert-engine.ts` - NEW

**Implement:**
- 14 alert triggers (as per spec)
- Email/in-app notifications
- Escalation rules

**Duration:** ~3-4 hours

---

## IMPLEMENTATION SEQUENCE

**Recommend:**

### Week 1: Foundation (Phase 1-2)
1. Database migrations (Phase 1a) - 2h
2. TypeScript types (Phase 2a) - 1h
3. Risk calculator (Phase 3a) - 2-3h
4. Basic CRUD endpoints (Phase 4a) - 3-4h
→ Total: ~9-10h

### Week 2: Discovery & Connectors (Phase 5)
1. One secrets manager connector (AWS or Azure) - 2-3h
2. One directory connector (Azure AD or Okta) - 2-3h
3. Generic firewall connector - 2h
4. Passive discovery stubs - 2-3h
→ Total: ~8-11h

### Week 3: Frontend - List & Search (Phase 6)
1. API Keys list page - 2-3h
2. User Identities list page - 2-3h
3. External Connections list page - 2-3h
4. Update main asset list with filters - 2-3h
→ Total: ~8-12h

### Week 4: Detail Views & Dashboard (Phase 7-8)
1. Risk dashboard - 3-4h
2. Extend asset detail page - 3-4h
3. Asset relationships display - 2-3h
→ Total: ~8-11h

### Week 5: Polish & Testing (Phase 9)
1. Alert engine - 3-4h
2. Testing and bug fixes - 4-6h
3. Documentation - 2h
→ Total: ~9-12h

---

## Total Estimate: 40-60 hours

---

## Priority Questions

1. **Scope Confirmation:** Should I implement all three asset types, or start with one (API Keys)?

2. **Connector Priority:** Which connectors are most critical?
   - Secrets Manager: AWS, Azure, Vault?
   - Directory: Azure AD, Okta, Google?
   - Firewall: Palo Alto, Cisco, or generic REST?

3. **Alert Delivery:** How should alerts be sent?
   - In-app notifications only?
   - Email integration?
   - Slack/Teams webhooks?

4. **Timeline:** Can you commit 40-60 hours across multiple sessions, or would you prefer a smaller MVP?

5. **Quick Wins:** Would you like to start with:
   - **MVP 1**: Just API Keys list + manual entry + risk calc (12-15h)
   - **MVP 2**: All three types with list pages, no connectors (20-25h)
   - **Full**: Complete implementation (40-60h)

