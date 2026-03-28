const postgres = require('postgres');
const bcrypt = require('bcryptjs');

const sql = postgres(process.env.DATABASE_URL || 'postgresql://restore:restore_dev_secret@postgres:5432/restore');

async function run() {
  try {
    const adminHash = await bcrypt.hash('Admin1234!', 10);
    await sql`
      INSERT INTO users (email, display_name, tier, roles, password_hash)
      VALUES ('admin@restore.local', 'Admin User', 'ADMIN', ARRAY['ADMIN'], ${adminHash})
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, tier = EXCLUDED.tier
    `;
    console.log('Created: admin@restore.local / Admin1234! (ADMIN)');

    const silverHash = await bcrypt.hash('Silver1234!', 10);
    await sql`
      INSERT INTO users (email, display_name, tier, roles, password_hash)
      VALUES ('commander@restore.local', 'Incident Commander', 'SILVER', ARRAY['COMMANDER'], ${silverHash})
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `;
    console.log('Created: commander@restore.local / Silver1234! (SILVER)');

    const bronzeHash = await bcrypt.hash('Bronze1234!', 10);
    await sql`
      INSERT INTO users (email, display_name, tier, roles, password_hash)
      VALUES ('analyst@restore.local', 'SOC Analyst', 'BRONZE', ARRAY['RESPONDER'], ${bronzeHash})
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `;
    console.log('Created: analyst@restore.local / Bronze1234! (BRONZE)');

    const goldHash = await bcrypt.hash('Gold1234!', 10);
    await sql`
      INSERT INTO users (email, display_name, tier, roles, password_hash)
      VALUES ('ciso@restore.local', 'CISO', 'GOLD', ARRAY['EXECUTIVE'], ${goldHash})
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `;
    console.log('Created: ciso@restore.local / Gold1234! (GOLD)');

    await sql.end();
    console.log('\nDone. Open http://localhost:5173');
  } catch (err) {
    console.error('Error:', err.message);
    await sql.end();
    process.exit(1);
  }
}

run();
