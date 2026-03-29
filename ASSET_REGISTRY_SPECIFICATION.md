# IT Asset Registry & Discovery Platform

## Database Schema

### Core Tables

#### 1. `assets` - Main Asset Record
```sql
CREATE TABLE assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id VARCHAR(50) UNIQUE NOT NULL,
  
  -- Basic Identity
  hostname VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  asset_type VARCHAR(50) NOT NULL, -- Server, Workstation, Laptop, Mobile, NetworkDevice, VM, CloudInstance, IoT, Unknown
  
  -- Network
  primary_ip_address INET,
  secondary_ip_addresses INET[],
  mac_addresses MACADDR[],
  
  -- Operating System
  os_name VARCHAR(255), -- Windows, Linux, macOS, etc.
  os_version VARCHAR(100),
  os_build VARCHAR(100),
  
  -- Hardware
  manufacturer VARCHAR(255),
  model VARCHAR(255),
  serial_number VARCHAR(255),
  cpu_cores INT,
  ram_gb INT,
  storage_gb INT,
  
  -- Location (Physical)
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
  status VARCHAR(50) DEFAULT 'Active', -- Active, Inactive, Decommissioned, Unknown, Unverified
  purchase_date DATE,
  warranty_expiry_date DATE,
  end_of_life_date DATE,
  
  -- Security & Health
  cve_count INT DEFAULT 0,
  last_vuln_scan_date TIMESTAMP,
  patch_level VARCHAR(100),
  confidence_score INT DEFAULT 0, -- 0-100
  
  -- Discovery & Tracking
  discovery_source VARCHAR(100), -- Manual, Intune, ServiceNow, Nmap, NetFlow, SNMP, PCAP, DNS, etc.
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_verified TIMESTAMP,
  verification_status VARCHAR(50), -- Online, Offline, Degraded, Unknown
  
  -- Metadata
  tags TEXT[], -- Array of tags for filtering
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_assets_hostname ON assets(hostname);
CREATE INDEX idx_assets_ip ON assets USING GIST(primary_ip_address inet_ops);
CREATE INDEX idx_assets_mac ON assets USING GIN(mac_addresses);
CREATE INDEX idx_assets_status ON assets(status);
CREATE INDEX idx_assets_discovery_source ON assets(discovery_source);
CREATE INDEX idx_assets_last_seen ON assets(last_seen);
```

#### 2. `asset_software` - Installed Software
```sql
CREATE TABLE asset_software (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  version VARCHAR(100),
  vendor VARCHAR(255),
  install_date DATE,
  license_key VARCHAR(255),
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_asset_software_asset ON asset_software(asset_id);
```

#### 3. `asset_network_interfaces` - Network Details
```sql
CREATE TABLE asset_network_interfaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  interface_name VARCHAR(100),
  ip_address INET NOT NULL,
  mac_address MACADDR,
  subnet_mask INET,
  gateway INET,
  dns_servers INET[],
  dhcp_enabled BOOLEAN,
  active BOOLEAN DEFAULT true
);

CREATE INDEX idx_network_interfaces_asset ON asset_network_interfaces(asset_id);
CREATE INDEX idx_network_interfaces_ip ON asset_network_interfaces(ip_address);
```

#### 4. `discovery_inbox` - Passively Discovered Assets Awaiting Review
```sql
CREATE TABLE discovery_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname VARCHAR(255),
  ip_addresses INET[],
  mac_addresses MACADDR[],
  evidence_source VARCHAR(100), -- PCAP, DNS, NetFlow, SNMP, etc.
  evidence_details JSONB, -- Raw discovery data (e.g., DNS queries, ARP packets)
  confidence_score INT, -- 0-100 based on evidence sources
  last_seen TIMESTAMP,
  status VARCHAR(50) DEFAULT 'Pending', -- Pending, Confirmed, Merged, Dismissed
  matched_asset_id UUID REFERENCES assets(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_discovery_inbox_status ON discovery_inbox(status);
CREATE INDEX idx_discovery_inbox_ip ON discovery_inbox USING GIST(ip_addresses inet_ops);
```

#### 5. `asset_audit_log` - Full Audit Trail
```sql
CREATE TABLE asset_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, VERIFY, MERGE
  changed_fields JSONB, -- { "field_name": { "old": ..., "new": ... } }
  user_id UUID NOT NULL REFERENCES users(id),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_log_asset ON asset_audit_log(asset_id);
CREATE INDEX idx_audit_log_user ON asset_audit_log(user_id);
CREATE INDEX idx_audit_log_created ON asset_audit_log(created_at);
```

#### 6. `connectors` - Integration Configuration
```sql
CREATE TABLE connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- intune, servicenow, generic, snmp, nmap, pcap, netflow, dns
  description TEXT,
  is_enabled BOOLEAN DEFAULT true,
  
  -- Configuration (encrypted)
  config_encrypted BYTEA NOT NULL, -- AES-256 encrypted JSON config
  
  -- Sync Settings
  last_sync TIMESTAMP,
  next_sync TIMESTAMP,
  sync_interval_minutes INT DEFAULT 1440, -- Daily
  sync_status VARCHAR(50), -- Running, Success, Failed, Pending
  last_error TEXT,
  
  -- Metadata
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_connectors_type ON connectors(type);
CREATE INDEX idx_connectors_enabled ON connectors(is_enabled);
```

#### 7. `connector_sync_log` - Sync History
```sql
CREATE TABLE connector_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  sync_started_at TIMESTAMP NOT NULL,
  sync_completed_at TIMESTAMP,
  status VARCHAR(50), -- Running, Success, Failed
  assets_discovered INT DEFAULT 0,
  assets_updated INT DEFAULT 0,
  assets_merged INT DEFAULT 0,
  error_message TEXT,
  sync_log TEXT -- Full log output
);

CREATE INDEX idx_sync_log_connector ON connector_sync_log(connector_id);
CREATE INDEX idx_sync_log_started ON connector_sync_log(sync_started_at);
```

#### 8. `health_check_results` - Active Verification Results
```sql
CREATE TABLE health_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL, -- ping, tcp_port, http, ssh_banner, wmi
  check_target VARCHAR(255), -- Port number, URL, etc.
  status VARCHAR(50), -- Online, Offline, Filtered, Unknown
  response_time_ms INT,
  last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  check_count INT DEFAULT 1,
  failure_count INT DEFAULT 0
);

CREATE INDEX idx_health_check_asset ON health_check_results(asset_id);
CREATE INDEX idx_health_check_last ON health_check_results(last_checked);
```

---

## API Endpoints (REST)

### Asset Management
- `GET /api/assets` - List all assets (filterable, paginated)
- `POST /api/assets` - Create new asset
- `GET /api/assets/:id` - Get asset details
- `PUT /api/assets/:id` - Update asset
- `DELETE /api/assets/:id` - Delete asset
- `POST /api/assets/bulk-edit` - Bulk update assets
- `GET /api/assets/export` - Export to CSV/PDF/Excel

### Discovery Inbox
- `GET /api/discovery/inbox` - List discovered assets
- `POST /api/discovery/inbox/:id/confirm` - Confirm and add to registry
- `POST /api/discovery/inbox/:id/merge` - Merge with existing asset
- `DELETE /api/discovery/inbox/:id` - Dismiss

### Health Checks
- `POST /api/health-checks/:asset-id` - Check single asset
- `POST /api/health-checks/verify-all` - Verify all assets (background job)
- `GET /api/health-checks/:asset-id/history` - Check history

### Connectors
- `GET /api/connectors` - List all connectors
- `POST /api/connectors` - Create connector
- `PUT /api/connectors/:id` - Update connector config
- `DELETE /api/connectors/:id` - Delete connector
- `POST /api/connectors/:id/sync` - Trigger immediate sync
- `GET /api/connectors/:id/sync-history` - View sync logs

### CSV Import
- `POST /api/import/template` - Download CSV template
- `POST /api/import/validate` - Validate CSV file
- `POST /api/import/process` - Process validated CSV
- `GET /api/import/preview/:upload-id` - Preview before import

### Reports & Dashboard
- `GET /api/reports/asset-summary` - Asset counts, distribution
- `GET /api/reports/discovery-metrics` - Discovery sources, confidence
- `GET /api/reports/asset-timeline` - Assets added over time
- `GET /api/reports/vulnerabilities` - CVE summary
- `GET /api/reports/export/:format` - Generate report (CSV, PDF, Excel)

### Audit & Compliance
- `GET /api/audit-log` - View all changes
- `GET /api/audit-log/:asset-id` - Asset change history

---

## Frontend Components

### Pages
1. **Asset Registry** - Main list view with filters, search, bulk actions
2. **Asset Detail** - Full record view with tabs (Overview, Network, Software, Security, History)
3. **Add/Edit Asset** - Multi-step form with validation
4. **Connectors** - Configure integrations, view sync status
5. **Discovery Inbox** - Review and action discovered assets
6. **Health Check Dashboard** - Asset status overview
7. **Reports** - Asset metrics and visualizations
8. **Audit Trail** - Change history and compliance audit

### UI Components
- Asset Status Badge (Online/Offline/Degraded/Unknown)
- Asset Type Icon with badge
- CSV Field Mapper (drag-and-drop)
- Connector Status Indicator with last sync time
- Progress bar for bulk operations
- Asset Comparison (side-by-side merge view)
- Network topology visualization (optional)

---

## Security & Encryption

1. **Credential Encryption**: All connector credentials stored with AES-256 encryption
2. **Audit Logging**: Every action logged with user, timestamp, IP, changes
3. **Access Control**: Role-based (Admin, Analyst, ReadOnly)
4. **API Key Management**: For agent heartbeat and webhook integrations

---

## Implementation Priority

### MVP Phase 1
1. Asset CRUD + manual add
2. Basic list view with filters
3. CSV import
4. Health checks (ICMP, TCP)

### MVP Phase 2
5. Connector framework
6. Intune connector
7. Nmap integration
8. Discovery inbox

### MVP Phase 3
9. ServiceNow and Generic REST connectors
10. PCAP passive discovery
11. Dashboard and reporting
12. Audit logging

---

## Technology Stack

- **Frontend**: React + TypeScript + Tailwind (existing)
- **Backend**: Node.js + Express (existing)
- **Database**: PostgreSQL (new tables)
- **Background Jobs**: Bull (Redis queue)
- **Encryption**: crypto-js + node:crypto
- **Network**: node-nmap, net, dgram (for SNMP), pcap-node (for PCAP)
- **Import/Export**: xlsx, csv-parser, pdfkit
