/**
 * seed-users.js — Multitenant seed script
 *
 * Creates:
 *   1. A platform super-admin (no tenant — can see all tenants)
 *   2. A demo tenant "Acme Corp"
 *   3. Sample users within that tenant at each tier
 *
 * Run: node seed-users.js
 */

const postgres = require('postgres');
const bcrypt   = require('bcryptjs');

const sql = postgres(
  process.env.DATABASE_URL || 'postgresql://restore:restore_dev_secret@localhost:5432/restore'
);

async function run() {
  console.log('Seeding multitenant users...\n');

  // ── 1. Platform super-admin (no tenant) ──────────────────────────────────
  const superHash = await bcrypt.hash('SuperAdmin1234!', 12);
  await sql`
    INSERT INTO users (email, display_name, tier, roles, password_hash, tenant_id, is_tenant_admin, is_active)
    VALUES ('superadmin@restore.platform', 'Platform Super Admin', 'ADMIN', ARRAY['ADMIN'], ${superHash}, NULL, FALSE, TRUE)
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, tier = EXCLUDED.tier
  `.catch(() => {
    // email uniqueness works differently in multitenant — try upsert without tenant constraint
    return sql`
      UPDATE users SET password_hash = ${superHash}, tier = 'ADMIN'
      WHERE email = 'superadmin@restore.platform' AND tenant_id IS NULL
    `;
  });
  console.log('Super-admin:  superadmin@restore.platform  /  SuperAdmin1234!');

  // ── 2. Demo tenant ────────────────────────────────────────────────────────
  let tenantId;
  const existing = await sql`SELECT id FROM tenants WHERE slug = 'acme-corp'`;
  if (existing.length) {
    tenantId = existing[0].id;
    console.log(`\nUsing existing tenant: acme-corp (${tenantId})`);
  } else {
    const [tenant] = await sql`
      INSERT INTO tenants (slug, name, plan, max_users, max_assets)
      VALUES ('acme-corp', 'Acme Corporation', 'professional', 20, 5000)
      RETURNING id
    `;
    tenantId = tenant.id;
    console.log(`\nCreated tenant: acme-corp (${tenantId})`);
  }

  // ── 3. Users within the demo tenant ──────────────────────────────────────
  const demoUsers = [
    { email: 'admin@acme.local',     name: 'Acme Admin',             tier: 'ADMIN',  password: 'Admin1234!',     isAdmin: true },
    { email: 'commander@acme.local', name: 'Incident Commander',     tier: 'SILVER', password: 'Silver1234!',    isAdmin: false },
    { email: 'analyst@acme.local',   name: 'SOC Analyst',            tier: 'BRONZE', password: 'Bronze1234!',    isAdmin: false },
    { email: 'ciso@acme.local',      name: 'CISO',                   tier: 'GOLD',   password: 'Gold1234!',      isAdmin: false },
    { email: 'author@acme.local',    name: 'Runbook Author',         tier: 'AUTHOR', password: 'Author1234!',    isAdmin: false },
  ];

  for (const u of demoUsers) {
    const hash = await bcrypt.hash(u.password, 12);
    // Check if user already exists for this tenant
    const exists = await sql`SELECT id FROM users WHERE email = ${u.email} AND tenant_id = ${tenantId}`;
    if (exists.length) {
      await sql`UPDATE users SET password_hash = ${hash}, tier = ${u.tier} WHERE id = ${exists[0].id}`;
    } else {
      await sql`
        INSERT INTO users (email, display_name, tier, roles, password_hash, tenant_id, is_tenant_admin, is_active)
        VALUES (${u.email}, ${u.name}, ${u.tier}, ARRAY[${u.tier}]::text[], ${hash}, ${tenantId}, ${u.isAdmin}, TRUE)
      `;
    }
    const label = u.isAdmin ? '(tenant admin)' : '';
    console.log(`  ${u.tier.padEnd(7)} ${u.email.padEnd(30)} /  ${u.password}  ${label}`);
  }

  // ── 4. Second demo tenant (to prove isolation) ────────────────────────────
  let tenant2Id;
  const existing2 = await sql`SELECT id FROM tenants WHERE slug = 'globex'`;
  if (existing2.length) {
    tenant2Id = existing2[0].id;
  } else {
    const [t2] = await sql`
      INSERT INTO tenants (slug, name, plan)
      VALUES ('globex', 'Globex Industries', 'starter')
      RETURNING id
    `;
    tenant2Id = t2.id;
  }
  const t2hash = await bcrypt.hash('Admin1234!', 12);
  const t2exists = await sql`SELECT id FROM users WHERE email = 'admin@globex.local' AND tenant_id = ${tenant2Id}`;
  if (!t2exists.length) {
    await sql`
      INSERT INTO users (email, display_name, tier, roles, password_hash, tenant_id, is_tenant_admin, is_active)
      VALUES ('admin@globex.local', 'Globex Admin', 'ADMIN', ARRAY['ADMIN'], ${t2hash}, ${tenant2Id}, TRUE, TRUE)
    `;
  }
  console.log(`\nSecond tenant (isolation test): globex`);
  console.log(`  admin@globex.local  /  Admin1234!`);

  console.log(`
════════════════════════════════════════════════════════════
  Login at: http://localhost:5173

  SUPER-ADMIN (sees all tenants):
    superadmin@restore.platform  /  SuperAdmin1234!

  ACME CORP TENANT (tenant_slug: acme-corp):
    admin@acme.local     /  Admin1234!   (tenant admin)
    commander@acme.local /  Silver1234!
    analyst@acme.local   /  Bronze1234!
    ciso@acme.local      /  Gold1234!
    author@acme.local    /  Author1234!

  GLOBEX TENANT (tenant_slug: globex):
    admin@globex.local   /  Admin1234!
════════════════════════════════════════════════════════════
  `);

  await sql.end();
}

run().catch(err => { console.error(err); process.exit(1); });
