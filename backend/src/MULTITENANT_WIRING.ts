// =============================================================================
// MULTITENANT WIRING INSTRUCTIONS
// =============================================================================

// ─── 1. RUN THE MIGRATION ─────────────────────────────────────────────────────
//
//   psql -d your_db -f backend/src/migrations/006_multitenant_schema.sql
//
// Then run the new seed script:
//   node backend/seed-users.js


// ─── 2. MOUNT TENANT ROUTES in backend/src/api/routes.ts ─────────────────────
//
//   import { tenantRouter } from '../modules/tenant/tenant-routes';
//
//   // Mount BEFORE assetRegistryRouter so /auth/login is overridden
//   router.use('/', tenantRouter);
//   router.use('/', assetRegistryRouter);
//   router.use('/', agentRouter);
//
// IMPORTANT: Remove or comment out the existing router.post('/auth/login', ...)
// and router.get('/auth/me', ...) in routes.ts — they are now handled by tenantRouter.


// ─── 3. ADD tenantContextMiddleware TO ASSET REGISTRY ROUTER ─────────────────
//
// In backend/src/modules/asset-registry/routes.ts, add at the top of the router:
//
//   import { tenantContextMiddleware, injectTenant, getTenantId } from '../../lib/tenant';
//
//   assetRegistryRouter.use(tenantContextMiddleware());
//
// Then on EVERY query that touches a tenant-scoped table, add tenant filtering.
// Example — GET /assets:
//
//   BEFORE:
//     const assets = await sql`SELECT * FROM assets ORDER BY created_at DESC`;
//
//   AFTER:
//     const tenantId = getTenantId(req);
//     const assets = await sql`
//       SELECT * FROM assets
//       WHERE ${tenantId ? sql`tenant_id = ${tenantId}` : sql`1=1`}
//       ORDER BY created_at DESC
//     `;
//
// Example — POST /assets (INSERT):
//
//   BEFORE:
//     await sql`INSERT INTO assets (hostname, ...) VALUES (${hostname}, ...)`;
//
//   AFTER:
//     await sql`INSERT INTO assets (hostname, ..., tenant_id)
//               VALUES (${hostname}, ..., ${getTenantId(req)})`;
//
// The injectTenant() helper makes this easier for object-style inserts:
//   const data = injectTenant(req, { hostname, primary_ip_address, ... });
//   await sql`INSERT INTO assets ${sql(data)}`;


// ─── 4. UPDATE Zustand auth store (apps/web/src/store/auth.ts) ───────────────
//
// Add tenant fields to the stored user type:
//
//   interface StoredUser {
//     sub: string;
//     email: string;
//     displayName: string;
//     restore_tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'AUTHOR' | 'ADMIN';
//     restore_roles: string[];
//     tenant_id: string | null;       // ADD
//     tenant_slug: string | null;     // ADD
//     is_tenant_admin: boolean;       // ADD
//   }
//
// The LoginPage.tsx already passes these fields to setAuth().


// ─── 5. UPDATE App.tsx ────────────────────────────────────────────────────────
//
//   import { AcceptInvitePage } from './pages/LoginPage';
//   import { TenantSettingsPage } from './pages/TenantSettingsPage';
//
//   // Add public route (no auth required):
//   <Route path="/accept-invite" element={<AcceptInvitePage />} />
//
//   // Add authenticated route:
//   <Route path="/settings/organisation" element={<TenantSettingsPage />} />


// ─── 6. ADD TO SIDEBAR in AppShell.tsx ───────────────────────────────────────
//
//   import { Building2 } from 'lucide-react';
//
//   // In nav items array, add:
//   { label: 'Organisation', path: '/settings/organisation', icon: Building2 }
//
//   // Optional: show tenant name in sidebar header:
//   const { user } = useAuth();
//   // user.tenant_slug is available


// ─── 7. ADD TENANT CONTEXT TO AGENT ROUTES ───────────────────────────────────
//
// In backend/src/modules/asset-registry/agent-routes.ts:
//
//   import { tenantContextMiddleware, getTenantId } from '../../lib/tenant';
//   agentRouter.use(tenantContextMiddleware());
//
// All INSERT queries into agents, agent_jobs etc. need tenant_id:
//   await sql`INSERT INTO agents (..., tenant_id) VALUES (..., ${getTenantId(req)})`;
//
// The /agent/heartbeat and other agent→cloud endpoints are already using
// their own api_key lookup — those don't have a user JWT. For those, look up
// the tenant_id from the agents table:
//   const [agent] = await sql`SELECT tenant_id FROM agents WHERE api_key = ${keyHashed}`;
//   const tenantId = agent.tenant_id;


// ─── 8. ASSET REGISTRY ROUTE TENANT INJECTION CHECKLIST ─────────────────────
//
// Every table needs tenant_id in WHERE (reads) and INSERT (writes).
// Priority order:
//
//   assets              ✗ needs tenant_id
//   connectors          ✗ needs tenant_id
//   scans               ✗ needs tenant_id
//   scan_results        ✗ needs tenant_id
//   discovery_inbox     ✗ needs tenant_id
//   api_keys            ✗ needs tenant_id
//   user_identities     ✗ needs tenant_id
//   external_connections ✗ needs tenant_id
//   asset_alerts        ✗ needs tenant_id
//   agents              ✗ needs tenant_id
//   agent_jobs          ✗ needs tenant_id
//   business_services   ✗ needs tenant_id
//   connectors (runbook) ✗ needs tenant_id


// ─── 9. ENVIRONMENT VARIABLES TO ADD ─────────────────────────────────────────
//
//   # URL shown in invitation emails
//   APP_URL=https://restore.yourcompany.com


// ─── 10. QUICK TEST ──────────────────────────────────────────────────────────
//
// After wiring, verify isolation works:
//
//   # Login as Acme admin and create an asset
//   curl -X POST http://localhost:3001/api/v1/auth/login \
//     -H "Content-Type: application/json" \
//     -d '{"email":"admin@acme.local","password":"Admin1234!","tenant_slug":"acme-corp"}'
//
//   # Copy the token, then GET /assets — should only see Acme assets
//
//   # Login as Globex admin
//   curl -X POST http://localhost:3001/api/v1/auth/login \
//     -H "Content-Type: application/json" \
//     -d '{"email":"admin@globex.local","password":"Admin1234!","tenant_slug":"globex"}'
//
//   # GET /assets — should see ZERO assets (different tenant, complete isolation)

export {};
