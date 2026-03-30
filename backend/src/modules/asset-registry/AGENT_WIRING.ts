// =============================================================================
// AGENT SYSTEM — WIRING INSTRUCTIONS
// =============================================================================

// ─── 1. REGISTER AGENT ROUTES in backend/src/api/routes.ts ───────────────────
//
// Add near the top with other imports:
//
//   import { agentRouter } from '../modules/asset-registry/agent-routes';
//
// Add below the existing asset registry mount:
//
//   router.use('/', agentRouter);


// ─── 2. ADD TO App.tsx ────────────────────────────────────────────────────────
//
// Add import:
//   import { AgentsPage } from './pages/silver/AgentsPage';
//
// Add route inside the AppShell routes:
//   <Route path="/assets/agents" element={<AgentsPage />} />


// ─── 3. ADD TO SIDEBAR NAVIGATION (AppShell.tsx) ─────────────────────────────
//
// Find the asset registry nav section and add:
//   { label: 'Remote Agents', path: '/assets/agents', icon: Server }


// ─── 4. ADD TO AddAssetsDropdown in AssetRegistryPage.tsx ────────────────────
//
// Add a new menu item:
//   { label: 'Remote Agent', icon: Server, onClick: () => navigate('/assets/agents'),
//     description: 'Discover assets on remote networks via agent' }


// ─── 5. RUN DATABASE MIGRATION ───────────────────────────────────────────────
//
//   psql -d your_db -f backend/src/migrations/005_create_agent_tables.sql


// ─── 6. DEPLOY THE AGENT ─────────────────────────────────────────────────────
//
// On the trusted machine (Windows or Linux):
//
//   # Install Node.js 20+
//   # Copy the agent folder to the machine
//   cd agent
//   npm install
//
//   # Copy agent.config.json.template -> agent.config.json
//   # Fill in AGENT_ID, AGENT_API_KEY (from registration), CLOUD_URL, AGENT_NETWORK
//
//   # Run directly:
//   npm start
//
//   # Or install as a Windows service (Task Scheduler):
//   # Create a scheduled task that runs: node dist/agent.js
//   # with "Start In" set to the agent folder
//   # set to run at system startup and restart on failure
//
//   # Or install as a Linux systemd service:
//   # Copy agent-service.template to /etc/systemd/system/restore-agent.service
//   # systemctl enable restore-agent
//   # systemctl start restore-agent


// ─── 7. OPTIONAL: ADD AGENT_ID TO EXISTING SCAN CREATION UI ─────────────────
//
// In ActiveScanPage.tsx, add an "Agent" select dropdown so users can choose
// whether to run the scan locally (blank) or route it to a specific agent.
// The selected agent_id gets included in the POST /api/v1/scans payload.
// The backend routes.ts run endpoint then checks:
//
//   if (scan.agent_id) {
//     // Create agent_job and wait for agent to pick it up
//     await sql`INSERT INTO agent_jobs (...) VALUES (...)`;
//   } else {
//     // Run locally as before
//     setImmediate(() => executeScan(scanId));
//   }

export {};
