# Implementation Plan: Active Scan Engine & Enhanced Connector Testing

## Overview
This plan covers two major features for the IT Asset Registry platform:
- **A. Active Scan Engine** - Network discovery and asset scanning system
- **B. Enhanced Connector Test & Validation** - 5-step validation with dry-run capability

---

## PHASE 1: ACTIVE SCAN ENGINE (A1-A4)

### PHASE 1a: Database Schema & Backend Types
**Files to create/modify:**
- `backend/src/migrations/002_create_scan_schema.sql` - NEW
- `backend/src/modules/asset-registry/types.ts` - EXTEND
- Backend scan types and interfaces

**Tables to create:**
```
scans
  - scan_id (UUID)
  - name, type, target_type, target_spec
  - timing, credentials (encrypted)
  - schedule (cron expression)
  - post_scan_actions (JSON array)
  - status (Queued/Running/Complete/Failed)
  - started_at, completed_at
  - host_count, hosts_up, hosts_down, new_discovered
  - created_by, updated_by

scan_results
  - result_id (UUID)
  - scan_id, target_ip, hostname, mac_address
  - status (Online/Offline/Filtered), latency_ms
  - open_ports (JSON), closed_ports, filtered_ports
  - os_fingerprint, confidence_score
  - banner_data (JSON)
  - ssl_cert_info (JSON)
  - matched_asset_id (FK to assets)
  - created_at

scan_progress_log
  - log_id (UUID)
  - scan_id, timestamp, message, status
  - hosts_completed, hosts_total
```

**Duration:** ~1 hour

---

### PHASE 1b: Scan Configuration UI (A1)
**File:** `apps/web/src/pages/silver/ActiveScanPage.tsx` - NEW

**Components:**
- `ScanConfigForm` - Multi-step form with:
  - Scan Name (text input)
  - Scan Type (dropdown: 6 options)
  - Target selection (radio group: 5 options)
  - Port Configuration (conditional, shown for TCP/Full/Nmap)
  - Scan Speed (dropdown: Slow/Normal/Fast)
  - Credentials (optional, expandable)
  - Schedule (radio: immediate/scheduled/recurring)
  - Post-Scan Actions (checkboxes: 5 options)
  
- `TargetInput` - Dynamic input based on target type
- `PortPresets` - Helper to generate port lists from presets
- `CredentialsForm` - SSH/WMI credential input with encryption
- `ScheduleSelector` - Date/time and cron selector
- Back button to return to Asset Registry

**Features:**
- Form validation with helpful error messages
- Visual warnings for "Fast" timing (IDS alerts)
- Warning for Full 1-65535 port scan (slow)
- Encrypt credentials before sending to backend
- Live form preview/summary

**Duration:** ~3-4 hours

---

### PHASE 1c: Scan Results UI (A4 - simplified)
**File:** `apps/web/src/pages/silver/ScanResultsPage.tsx` - NEW

**Components:**
- `ScanListView` - Table showing all scans with columns:
  - Name, Type, Target, Status, Started, Duration
  - Hosts Scanned, Hosts Up, New Discovered
  - Actions: View Results | Re-run | Delete

- `ScanProgressView` - Live progress shown while scanning:
  - Progress bar (X of Y hosts completed)
  - Auto-refreshing feed every 2s
  - Cancel button

- `ScanDetailView` - Results detail with:
  - Summary cards (Total | Online | Offline | New Discovered)
  - Results table (IP | Hostname | Status | Latency | Ports | OS | Actions)
  - Filters (Online only | Offline only | New | Has ports)
  - Per-row actions (Add to Registry | View Asset | Dismiss)
  - Export to CSV button

**Duration:** ~3-4 hours

---

### PHASE 1d: Backend - Scan Management API
**File:** `backend/src/modules/asset-registry/routes.ts` - EXTEND

**Endpoints:**
```
POST   /api/v1/scans              - Create new scan config
GET    /api/v1/scans              - List all scans
GET    /api/v1/scans/:id          - Get scan details
PUT    /api/v1/scans/:id          - Update scan config
DELETE /api/v1/scans/:id          - Delete scan

POST   /api/v1/scans/:id/run      - Start scan execution
POST   /api/v1/scans/:id/cancel   - Cancel running scan
GET    /api/v1/scans/:id/progress - Get live progress
GET    /api/v1/scans/:id/results  - Get scan results with filters
```

**Validation:**
- Zod schema for scan configuration
- Target validation (CIDR expansion, IP range parsing)
- Port validation and expansion
- Credential encryption using AES-256

**Duration:** ~2 hours

---

### PHASE 1e: Backend - Scan Execution Engine (ICMP)
**Files:** 
- `backend/src/modules/asset-registry/scanners/icmp.ts` - NEW
- `backend/src/modules/asset-registry/scanners/index.ts` - NEW

**Implement:**
- ICMP Ping Sweep (max 50 concurrent)
- Send 3 ICMP packets per IP, 1s timeout
- Extract: responded (bool), avg_latency_ms, packet_loss_pct, ttl
- TTL→OS hinting (64→Linux, 128→Windows, 255→Network Device)
- Result: status (Online/Offline/Filtered), latency, packet_loss

**Note:** ICMP requires elevated privileges (raw sockets). May need to:
- Use Node.js ICMP library (`ping` or `iputils`)
- Or shell out to system `ping` command
- Document privilege requirements in README

**Duration:** ~2 hours

---

### PHASE 1f: Backend - TCP Port Scanner & Banner Grab
**File:** `backend/src/modules/asset-registry/scanners/tcp.ts` - NEW

**Implement:**
- TCP SYN connection for each IP×port (2s timeout)
- Port state detection: Open | Closed | Filtered
- Banner grab on open ports (read 1024 bytes)
- Service identification (hardcoded port→service map)
- Result: open_ports[], closed_ports[], filtered_ports[]

**Libraries:** Use `net` module for TCP connections

**Duration:** ~2 hours

---

### PHASE 1g: Backend - Nmap Integration
**File:** `backend/src/modules/asset-registry/scanners/nmap.ts` - NEW

**Implement:**
- Verify Nmap installed at startup (`nmap --version`)
- Disable Nmap in UI if not available
- Build dynamic Nmap command based on config
- Execute subprocess with 10-minute timeout
- Parse Nmap XML output
- Extract: hosts up/down, OS matches (>85% accuracy), open ports, services, versions, scripts

**Libraries:** `child_process.execFile`, `xml2js` for XML parsing

**Duration:** ~3-4 hours

---

### PHASE 1h: Backend - Additional Scanners (Optional)
**Files:**
- `backend/src/modules/asset-registry/scanners/snmp.ts` - SNMP polling
- `backend/src/modules/asset-registry/scanners/http.ts` - HTTP/HTTPS health check

**Scope:** These are complex. Prioritize based on user feedback.
- SNMP: Requires `snmp` library, OID mapping
- HTTP/HTTPS: Use `axios`, SSL cert parsing

**Duration:** ~2-3 hours each (if implemented)

---

### PHASE 1i: Backend - Result Processing (A3)
**File:** `backend/src/modules/asset-registry/scanners/result-processor.ts` - NEW

**Implement:**
- Match scan results to existing assets:
  - Priority 1: MAC address exact match
  - Priority 2: IP address exact match
  - Priority 3: Hostname (case-insensitive)
- Update existing assets with scan results
- Create new assets if enabled and no match
- Add to Discovery Inbox for review
- Calculate confidence score (+20 ICMP, +20 TCP, +25 Nmap, +20 SNMP, +15 DNS)
- Log changes in audit trail

**Duration:** ~2 hours

---

### PHASE 1 TOTAL: ~20-25 hours

---

## PHASE 2: ENHANCED CONNECTOR TEST & VALIDATION (B1-B4)

### PHASE 2a: Enhance Backend Test Endpoint
**File:** `backend/src/modules/asset-registry/routes.ts` - EXTEND

**Enhance existing `/api/v1/connectors/test` to support 5-step flow:**

**STEP 1 - Authentication Test:**
- No Auth: skip to Step 2
- API Key/Bearer: GET base_url (or /ping), check 200-299
- Basic Auth: Same with Basic header
- OAuth2: POST token_url, validate access_token response

**STEP 2 - Endpoint Reachability:**
- GET endpoint with auth from Step 1
- Detailed error messages for each HTTP status code
- Check response is valid JSON

**STEP 3 - Response Structure Validation:**
- Parse JSON response
- Check response_root_key exists and is array
- Count records and extract sample data

**STEP 4 - Field Mapping Validation:**
- Take first 5 records
- Apply field map to each
- Validate: field exists, value format, not null/empty
- Return warnings/errors per field

**STEP 5 - Pagination Check:**
- Verify pagination field exists in response
- Show current pagination value

**Return:** Array of step results with status, summary, details

**Duration:** ~3-4 hours

---

### PHASE 2b: Enhanced Test Results Display UI
**File:** `apps/web/src/pages/silver/AssetConnectorsPage.tsx` - EXTEND

**Enhance existing component:**
- Change test results panel to vertical stepper
- One row per step: icon (spinner/tick/X/warning), name, summary, expandable detail
- Overall banner: green/amber/red based on results
- Action buttons: Save Connector | Run Sync Now (if all passed) | Edit Field Map

**Create new component:**
- `TestResultsStepper` - Visual stepper showing all 5 steps
- `StepDetail` - Expandable details for each step (JSON preview, error msg, preview table)

**Duration:** ~2-3 hours

---

### PHASE 2c: Dry Run Capability
**File:** `backend/src/modules/asset-registry/routes.ts` - ADD NEW ENDPOINT

**POST /api/v1/connectors/:id/dry-run**
- Fetch ALL pages (full pagination)
- Apply field mapping to every record
- Match against existing assets
- Do NOT write to database
- Return dry run report:
  - Total records fetched
  - Records to CREATE (new)
  - Records to UPDATE (existing) - show field diffs
  - Records to SKIP (no match key)
  - Records with errors

**Frontend:**
- Add "Run Dry Run" button in connector test results
- Show dry run report in modal/panel
- Show preview table (first 20 rows)
- Export dry run as CSV
- Confirmation prompt before live sync

**Duration:** ~3-4 hours

---

### PHASE 2d: Health Monitoring & Alerts
**File:** `apps/web/src/pages/silver/AssetConnectorsPage.tsx` - EXTEND

**Enhance ConnectorCard to show:**
- Health indicator (green/amber/red/gray)
- Last 10 syncs as sparkline chart
- Current error streak counter
- Auto-disable warning
- Last successful sync timestamp

**Backend:**
- Track last N sync results in database
- Calculate health status based on recent runs
- Detect patterns: consecutive failures, low record counts

**Duration:** ~2-3 hours

---

### PHASE 2 TOTAL: ~12-15 hours

---

## IMPLEMENTATION SEQUENCE

**Recommend starting with:**

### Week 1: Active Scan Foundation
1. PHASE 1a: Database schema (1h)
2. PHASE 1b: Scan configuration UI (3-4h)
3. PHASE 1d: Backend scan API endpoints (2h)
4. PHASE 1e: ICMP scanner (2h)
5. Test and validate

### Week 2: Scan Engine Completion
1. PHASE 1f: TCP scanner (2h)
2. PHASE 1g: Nmap integration (3-4h)
3. PHASE 1i: Result processing (2h)
4. PHASE 1c: Results UI (3-4h)
5. Integration testing

### Week 3: Connector Enhancements
1. PHASE 2a: Enhanced test endpoint (3-4h)
2. PHASE 2b: Stepper UI (2-3h)
3. PHASE 2c: Dry run (3-4h)
4. PHASE 2d: Health monitoring (2-3h)

---

## Priority Questions for User

1. **Nmap Installation:** Should we assume Nmap is installed, or handle the case where it isn't?
2. **Privilege Requirements:** ICMP scanning requires raw sockets (elevated privileges). Is this acceptable?
3. **SNMP & HTTP Scanners:** Implement these in Phase 1 or defer to later?
4. **Scan Scheduling:** Full cron support (complex) or simple presets (daily/weekly)?
5. **Async Execution:** Should scans run in background with job queue, or inline?
6. **Results Storage:** Keep full scan results history indefinitely, or archive after N days?

---

## Key Technical Decisions

1. **Async Execution:** Use BullMQ or simple setTimeout for now?
2. **ICMP Implementation:** Node.js library or shell `ping`?
3. **Nmap XML Parsing:** `xml2js` library recommended
4. **Credential Encryption:** Reuse existing `encryptConfig()` from connectors
5. **Back Navigation:** Add back button to Active Scan page → Asset Registry ✓

