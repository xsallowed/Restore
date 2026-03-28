const postgres = require('postgres');
const bcrypt = require('bcryptjs');

const sql = postgres(process.env.DATABASE_URL || 'postgresql://restore:restore_dev_secret@localhost:5432/restore');

async function run() {
  const hash = await bcrypt.hash('Admin1234!', 10);

  await sql`
    INSERT INTO users (email, display_name, tier, roles, password_hash)
    VALUES (
      'admin@restore.local',
      'Admin User',
      'ADMIN',
      ARRAY['ADMIN'],
      ${hash}
    )
    ON CONFLICT (email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      tier = EXCLUDED.tier
  `;

  console.log('Admin user created — admin@restore.local / Admin1234!');

  await sql`
    INSERT INTO users (email, display_name, tier, roles, password_hash)
    VALUES (
      'commander@restore.local',
      'Incident Commander',
      'SILVER',
      ARRAY['COMMANDER'],
      ${await bcrypt.hash('Silver1234!', 10)}
    )
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `;
  console.log('Silver user created  — commander@restore.local / Silver1234!');

  await sql`
    INSERT INTO users (email, display_name, tier, roles, password_hash)
    VALUES (
      'analyst@restore.local',
      'SOC Analyst',
      'BRONZE',
      ARRAY['RESPONDER'],
      ${await bcrypt.hash('Bronze1234!', 10)}
    )
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `;
  console.log('Bronze user created  — analyst@restore.local / Bronze1234!');

  await sql`
    INSERT INTO users (email, display_name, tier, roles, password_hash)
    VALUES (
      'ciso@restore.local',
      'Chief Information Security Officer',
      'GOLD',
      ARRAY['EXECUTIVE'],
      ${await bcrypt.hash('Gold1234!', 10)}
    )
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `;
  console.log('Gold user created    — ciso@restore.local / Gold1234!');

  await sql.end();
  console.log('\nAll done. Open http://localhost:5173 to log in.');
}

run().catch(err => { console.error(err); process.exit(1); });
