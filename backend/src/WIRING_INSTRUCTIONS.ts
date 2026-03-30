// ─── ADDITIONS TO backend/src/index.ts ──────────────────────────────────────
// Add these imports and calls to your existing index.ts

// 1. Import the new engines
import { initScanEngine } from './modules/asset-registry/scanners/engine';
import { initAlertEngine, scheduleAlertEvaluation } from './modules/asset-registry/alert-engine';
import { sql } from './lib/db'; // Your postgres.js instance

// 2. Add auth-specific rate limiting (stricter than global 200/min)
// Add this BEFORE your existing app.use('/api/', rateLimit(...))
import rateLimit from 'express-rate-limit';

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // max 20 login attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again in 15 minutes.' },
});

// Apply to auth endpoints specifically in your router:
// app.use('/api/v1/auth', authRateLimit);

// 3. In your main() function, after app starts, add:
async function initializeEngines() {
  // Init scan engine with database connection
  initScanEngine({ sql });

  // Init alert engine with SMTP config from environment
  initAlertEngine({
    sql,
    smtpConfig: process.env.SMTP_HOST ? {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'noreply@itassetregistry.local',
    } : undefined,
  });

  // Run alert evaluation every hour
  scheduleAlertEvaluation(60);
}

// Call initializeEngines() inside main() after the server starts:
// await initializeEngines();


// ─── ENVIRONMENT VARIABLES TO ADD TO .env.example ────────────────────────────

/*
# SMTP Configuration (for email report delivery and alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourcompany.com

# File Upload Directory
UPLOAD_DIR=/tmp/asset-uploads

# Encryption salt (change in production!)
ENCRYPTION_SALT=change-me-in-production-use-random-32-char-string
*/


// ─── PACKAGE.JSON ADDITIONS ───────────────────────────────────────────────────
// Add these to backend/package.json dependencies:

/*
"dependencies": {
  ...existing...
  "nodemailer": "^6.9.0",
  "multer": "^1.4.5",
  "csv-writer": "^1.6.0",
  "xml2js": "^0.6.2",
  "axios": "^1.6.0"
}

"devDependencies": {
  ...existing...
  "@types/nodemailer": "^6.4.0",
  "@types/multer": "^1.4.0",
  "@types/xml2js": "^0.4.0"
}
*/


// ─── ROUTE REGISTRATION ───────────────────────────────────────────────────────
// In your existing routes.ts, the scan engine needs to be called when a scan runs.
// Find the existing POST /scans/:id/run handler and add:

/*
import { executeScan } from './scanners/engine';

// In the run endpoint, after updating status to Running:
// Don't await — run in background
setImmediate(() => executeScan(scanId));
*/


// ─── MIGRATION RUN ORDER ─────────────────────────────────────────────────────
// Run migrations in this order:
// 1. 001_create_asset_registry_schema.sql  (existing)
// 2. 002_create_scan_schema.sql             (existing)
// 3. 003_create_extended_assets_schema.sql  (existing)
// 4. 004_create_missing_tables.sql          (NEW - this session)

export {};
