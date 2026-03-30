// ─── ADDITIONAL ROUTES TO ADD TO routes.ts ──────────────────────────────────
// Paste these into your existing assetRegistryRouter in routes.ts

import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createObjectCsvStringifier } from 'csv-writer';
import axios from 'axios';

const upload = multer({
  dest: process.env.UPLOAD_DIR || '/tmp/asset-uploads',
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

// ─── 5-STEP CONNECTOR TEST ───────────────────────────────────────────────────

/**
 * POST /api/v1/connectors/:id/test-full
 * Run full 5-step connector validation
 */
assetRegistryRouter.post(
  '/connectors/:id/test-full',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const connectors = await sql`SELECT * FROM connectors WHERE connector_id = ${id}`;
      if (!connectors.length) return res.status(404).json({ success: false, error: 'Not found' });
      const connector = connectors[0];
      const config = connector.auth_config ? decryptConfig(connector.auth_config) : {};

      const steps: any[] = [];

      // STEP 1: Authentication
      let authToken: string | undefined;
      let authHeaders: Record<string, string> = {};
      try {
        if (connector.auth_type === 'None') {
          steps.push({ step: 1, name: 'Authentication', status: 'skipped', summary: 'No auth configured' });
        } else if (connector.auth_type === 'OAuth2') {
          const tokenResp = await axios.post(config.token_url as string, new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: config.client_id as string,
            client_secret: config.client_secret as string,
            scope: (config.scope as string) || '',
          }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 });
          authToken = tokenResp.data.access_token;
          authHeaders['Authorization'] = `Bearer ${'•'.repeat(20)}`;
          steps.push({ step: 1, name: 'Authentication', status: 'passed', summary: 'OAuth2 token obtained successfully' });
        } else if (connector.auth_type === 'API Key') {
          authHeaders['X-Api-Key'] = config.api_key as string;
          steps.push({ step: 1, name: 'Authentication', status: 'passed', summary: 'API key configured' });
        } else if (connector.auth_type === 'Bearer Token') {
          authHeaders['Authorization'] = `Bearer ${config.token}`;
          steps.push({ step: 1, name: 'Authentication', status: 'passed', summary: 'Bearer token configured' });
        } else if (connector.auth_type === 'Basic Auth') {
          const encoded = Buffer.from(`${config.username}:${config.password}`).toString('base64');
          authHeaders['Authorization'] = `Basic ${encoded}`;
          steps.push({ step: 1, name: 'Authentication', status: 'passed', summary: 'Basic auth configured' });
        }
      } catch (err: any) {
        const status = err.response?.status;
        steps.push({
          step: 1, name: 'Authentication', status: 'failed',
          summary: status === 401 ? 'Bad credentials (401)' : status === 403 ? 'Insufficient permissions (403)' : `Auth failed: ${err.message}`,
        });
        return res.json({ success: true, steps, overall: 'failed' });
      }

      // STEP 2: Endpoint Reachability
      let rawResponse: any;
      try {
        const testHeaders = { ...authHeaders };
        if (authToken) testHeaders['Authorization'] = `Bearer ${authToken}`;
        const resp = await axios.get(`${connector.base_url}${connector.endpoint}`, {
          headers: testHeaders, timeout: 15000, validateStatus: () => true,
        });
        rawResponse = resp.data;
        const statusOk = resp.status >= 200 && resp.status < 300;
        const statusMsgs: Record<number, string> = { 400: 'Bad request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Endpoint not found', 429: 'Rate limited', 500: 'Server error' };
        steps.push({
          step: 2, name: 'Endpoint Reachability',
          status: statusOk ? 'passed' : 'failed',
          summary: statusOk ? `HTTP ${resp.status} OK` : `HTTP ${resp.status}: ${statusMsgs[resp.status] || 'Error'}`,
        });
        if (!statusOk) return res.json({ success: true, steps, overall: 'failed' });
      } catch (err: any) {
        steps.push({ step: 2, name: 'Endpoint Reachability', status: 'failed', summary: `Cannot reach endpoint: ${err.message}` });
        return res.json({ success: true, steps, overall: 'failed' });
      }

      // STEP 3: Response Structure
      try {
        const rootKey = connector.response_root_key;
        const records = rootKey ? rawResponse[rootKey] : rawResponse;
        if (!Array.isArray(records)) {
          steps.push({ step: 3, name: 'Response Structure', status: 'failed', summary: `Key "${rootKey}" is not an array`, rawSample: JSON.stringify(rawResponse).substring(0, 500) });
        } else {
          steps.push({ step: 3, name: 'Response Structure', status: 'passed', summary: `Found ${records.length} records under "${rootKey}"`, recordCount: records.length });
        }
      } catch {
        steps.push({ step: 3, name: 'Response Structure', status: 'failed', summary: 'Invalid JSON response' });
      }

      // STEP 4: Field Map Validation
      try {
        const rootKey = connector.response_root_key;
        const records = (rootKey ? rawResponse[rootKey] : rawResponse) || [];
        const sample = records.slice(0, 5);
        const fieldMap = connector.field_map || {};
        const warnings: string[] = [];
        const errors: string[] = [];
        const requiredFields = ['asset_name'];

        for (const [sourceKey] of Object.entries(fieldMap)) {
          for (const record of sample) {
            const parts = sourceKey.split('.');
            let val: any = record;
            for (const p of parts) val = val?.[p];
            if (val === undefined) warnings.push(`Key "${sourceKey}" missing in sample records`);
            else if (val === null || val === '') warnings.push(`Key "${sourceKey}" has empty values`);
          }
        }

        const status = errors.length > 0 ? 'failed' : warnings.length > 0 ? 'warning' : 'passed';
        steps.push({
          step: 4, name: 'Field Map Validation', status,
          summary: `${Object.keys(fieldMap).length} fields mapped. ${warnings.length} warnings, ${errors.length} errors.`,
          warnings, errors, preview: sample.slice(0, 3),
        });
      } catch {
        steps.push({ step: 4, name: 'Field Map Validation', status: 'warning', summary: 'Could not validate field map' });
      }

      // STEP 5: Pagination Check
      try {
        const paginationType = connector.pagination_type;
        let paginationFound = false;
        let detail = '';

        if (paginationType === 'None') {
          paginationFound = true; detail = 'No pagination configured';
        } else if (paginationType === 'Cursor' || paginationType === 'nextLink') {
          paginationFound = !!(rawResponse?.['@odata.nextLink'] || rawResponse?.next || rawResponse?.nextLink || rawResponse?.cursor);
          detail = paginationFound ? 'Next page cursor found' : 'No next page cursor in response (may be last page)';
        } else if (paginationType === 'Offset-Limit') {
          paginationFound = true; detail = 'Offset/limit pagination configured';
        } else if (paginationType === 'Page Number') {
          paginationFound = true; detail = 'Page number pagination configured';
        }

        steps.push({
          step: 5, name: 'Pagination Check',
          status: paginationFound ? 'passed' : 'warning',
          summary: detail,
        });
      } catch {
        steps.push({ step: 5, name: 'Pagination Check', status: 'warning', summary: 'Could not verify pagination' });
      }

      const allPassed = steps.every((s) => s.status === 'passed' || s.status === 'skipped');
      const anyFailed = steps.some((s) => s.status === 'failed');
      const overall = anyFailed ? 'failed' : allPassed ? 'passed' : 'warning';

      res.json({ success: true, steps, overall });
    } catch (err) {
      logger.error('POST /connectors/:id/test-full error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── DRY RUN ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/connectors/:id/dry-run
 * Fetch all pages, apply field map, match against assets — do NOT write to DB
 */
assetRegistryRouter.post(
  '/connectors/:id/dry-run',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const connectors = await sql`SELECT * FROM connectors WHERE connector_id = ${id}`;
      if (!connectors.length) return res.status(404).json({ success: false, error: 'Not found' });
      const connector = connectors[0];
      const config = connector.auth_config ? decryptConfig(connector.auth_config) : {};

      // Get auth token
      let authHeaders: Record<string, string> = {};
      if (connector.auth_type === 'OAuth2') {
        try {
          const tokenResp = await axios.post(config.token_url as string, new URLSearchParams({
            grant_type: 'client_credentials', client_id: config.client_id as string,
            client_secret: config.client_secret as string,
          }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
          authHeaders['Authorization'] = `Bearer ${tokenResp.data.access_token}`;
        } catch (err) {
          return res.json({ success: false, error: `Auth failed: ${String(err)}` });
        }
      } else if (connector.auth_type === 'API Key') {
        authHeaders['X-Api-Key'] = config.api_key as string;
      } else if (connector.auth_type === 'Bearer Token') {
        authHeaders['Authorization'] = `Bearer ${config.token}`;
      } else if (connector.auth_type === 'Basic Auth') {
        const encoded = Buffer.from(`${config.username}:${config.password}`).toString('base64');
        authHeaders['Authorization'] = `Basic ${encoded}`;
      }

      // Fetch all pages
      const allRecords: any[] = [];
      let offset = 0;
      let nextLink: string | undefined;
      let pageNum = 0;
      const rootKey = connector.response_root_key;

      while (allRecords.length < 10000) {
        let url = `${connector.base_url}${connector.endpoint}`;
        const params: Record<string, any> = {};

        if (connector.pagination_type === 'Offset-Limit') { params.offset = offset; params.limit = 100; }
        else if (connector.pagination_type === 'Page Number') { params.page = pageNum; params['page-size'] = 100; }

        if (nextLink) url = nextLink;

        const resp = await axios.get(url, { headers: authHeaders, params, timeout: 30000, validateStatus: () => true });
        if (resp.status === 429) {
          const retryAfter = parseInt(resp.headers['retry-after'] || '5');
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue;
        }
        if (resp.status >= 400) break;

        const records: any[] = rootKey ? resp.data[rootKey] : resp.data;
        if (!Array.isArray(records) || records.length === 0) break;
        allRecords.push(...records);

        // Check for next page
        nextLink = resp.data['@odata.nextLink'] || resp.data.nextLink || resp.data.next || undefined;
        if (!nextLink) {
          if (connector.pagination_type === 'Offset-Limit') { offset += 100; if (records.length < 100) break; }
          else if (connector.pagination_type === 'Page Number') { pageNum++; if (records.length < 100) break; }
          else break;
        }
      }

      // Apply field map
      const fieldMap = connector.field_map || {};
      const existingAssets = await sql`SELECT asset_id, hostname, primary_ip_address, serial_number, mac_addresses FROM assets`;

      const previewRows: any[] = [];
      let toCreate = 0, toUpdate = 0, toSkip = 0, mappingErrors = 0;

      for (const record of allRecords) {
        const mapped: Record<string, any> = {};
        for (const [sourceKey, targetField] of Object.entries(fieldMap)) {
          const parts = String(sourceKey).split('.');
          let val: any = record;
          for (const p of parts) val = val?.[p];
          if (val !== undefined) mapped[String(targetField)] = val;
        }

        if (!mapped.asset_name && !mapped.hostname) { toSkip++; continue; }

        // Match against existing
        const serial = mapped.serial_number;
        const mac = mapped.mac_address;
        const hostname = mapped.hostname || mapped.asset_name;
        const ip = mapped.ip_address;

        let matchedId: string | undefined;
        if (serial) matchedId = existingAssets.find((a: any) => a.serial_number === serial)?.asset_id;
        if (!matchedId && mac) matchedId = existingAssets.find((a: any) => a.mac_addresses?.includes(mac))?.asset_id;
        if (!matchedId && hostname && ip) matchedId = existingAssets.find((a: any) => a.hostname === hostname && a.primary_ip_address === ip)?.asset_id;

        if (matchedId) toUpdate++;
        else toCreate++;

        if (previewRows.length < 20) {
          previewRows.push({
            source_identifier: mapped.asset_name || mapped.hostname || record[Object.keys(record)[0]],
            match_status: matchedId ? 'Matched' : 'New',
            action: matchedId ? 'Update' : 'Create',
            fields_mapped: Object.keys(mapped).length,
            warnings: mapped.asset_name ? [] : ['asset_name missing'],
          });
        }
      }

      res.json({
        success: true,
        data: {
          total_fetched: allRecords.length,
          to_create: toCreate,
          to_update: toUpdate,
          to_skip: toSkip,
          mapping_errors: mappingErrors,
          preview: previewRows,
        },
      });
    } catch (err) {
      logger.error('POST /connectors/:id/dry-run error', { err: String(err) });
      res.status(500).json({ success: false, error: String(err) });
    }
  }
);

// ─── FILE ATTACHMENTS ────────────────────────────────────────────────────────

/**
 * POST /api/v1/assets/:id/attachments
 * Upload a file attachment to an asset (warranty, PO, etc.)
 */
assetRegistryRouter.post(
  '/assets/:id/attachments',
  requireAuth,
  requireMinTier('SILVER'),
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const file = (req as any).file;
      if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

      const attachmentId = `ATT-${Date.now()}-${Math.random().toString(36).substring(5)}`;
      const attachmentType = req.body.attachment_type || 'other';

      await sql`
        INSERT INTO asset_attachments (
          attachment_id, asset_id, filename, original_filename,
          file_size_bytes, mime_type, attachment_type, storage_path, uploaded_by
        ) VALUES (
          ${attachmentId}, ${id}, ${file.filename}, ${file.originalname},
          ${file.size}, ${file.mimetype}, ${attachmentType},
          ${file.path}, ${req.user!.id}
        )
      `;

      res.status(201).json({
        success: true,
        data: { attachment_id: attachmentId, filename: file.originalname, size: file.size },
      });
    } catch (err) {
      logger.error('POST /assets/:id/attachments error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/assets/:id/attachments
 * List attachments for an asset
 */
assetRegistryRouter.get(
  '/assets/:id/attachments',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const attachments = await sql`
        SELECT attachment_id, original_filename, file_size_bytes, mime_type, attachment_type, created_at
        FROM asset_attachments WHERE asset_id = ${req.params.id} ORDER BY created_at DESC
      `;
      res.json({ success: true, data: attachments });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/assets/:id/attachments/:attachmentId/download
 * Download an attachment
 */
assetRegistryRouter.get(
  '/assets/:id/attachments/:attachmentId/download',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const attachments = await sql`
        SELECT * FROM asset_attachments WHERE attachment_id = ${req.params.attachmentId} AND asset_id = ${req.params.id}
      `;
      if (!attachments.length) return res.status(404).json({ success: false, error: 'Not found' });
      const att = attachments[0];
      res.setHeader('Content-Disposition', `attachment; filename="${att.original_filename}"`);
      res.setHeader('Content-Type', att.mime_type);
      res.sendFile(path.resolve(att.storage_path));
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── CSV TEMPLATE DOWNLOAD ───────────────────────────────────────────────────

/**
 * GET /api/v1/assets/import/template
 * Download CSV import template
 */
assetRegistryRouter.get(
  '/assets/import/template',
  requireAuth,
  requireMinTier('SILVER'),
  async (_req: Request, res: Response) => {
    try {
      const fields = await sql`SELECT * FROM csv_template_fields ORDER BY sort_order`;
      const header = fields.map((f: any) => f.field_name).join(',');
      const examples = fields.map((f: any) => `"${f.example_value || ''}"`).join(',');
      const descriptions = fields.map((f: any) => `"${f.description || ''}"`).join(',');

      const csv = `# IT Asset Registry Import Template\n# ${descriptions}\n${header}\n${examples}\n`;

      res.setHeader('Content-Disposition', 'attachment; filename="asset-import-template.csv"');
      res.setHeader('Content-Type', 'text/csv');
      res.send(csv);
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── SCHEDULED REPORTS ───────────────────────────────────────────────────────

/**
 * GET /api/v1/reports/scheduled
 * List scheduled reports
 */
assetRegistryRouter.get(
  '/reports/scheduled',
  requireAuth,
  requireMinTier('SILVER'),
  async (_req: Request, res: Response) => {
    try {
      const reports = await sql`SELECT * FROM scheduled_reports ORDER BY created_at DESC`;
      res.json({ success: true, data: reports });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/reports/scheduled
 * Create a scheduled report
 */
assetRegistryRouter.post(
  '/reports/scheduled',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { name, report_type, format, schedule_cron, recipient_emails, filters } = req.body;
      const reportId = `REP-${Date.now()}-${Math.random().toString(36).substring(5)}`;

      await sql`
        INSERT INTO scheduled_reports (report_id, name, report_type, format, schedule_cron, recipient_emails, filters, created_by)
        VALUES (${reportId}, ${name}, ${report_type}, ${format || 'csv'}, ${schedule_cron},
          ${recipient_emails}, ${filters ? sql.json(filters) : null}, ${req.user!.id})
      `;

      res.status(201).json({ success: true, data: { report_id: reportId } });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/reports/send-now
 * Immediately send/generate a report
 */
assetRegistryRouter.post(
  '/reports/send-now',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { report_type, format, recipient_emails, filters } = req.body;

      // Generate report data
      let data: any[] = [];
      if (report_type === 'full_asset_list') {
        data = await sql`SELECT * FROM assets ORDER BY created_at DESC`;
      } else if (report_type === 'risk_summary') {
        const apiKeys = await sql`SELECT asset_id, key_name, risk_level, owner_email FROM api_keys WHERE risk_level IN ('Critical', 'High')`;
        const users = await sql`SELECT asset_id, display_name, email, risk_level FROM user_identities WHERE risk_level IN ('Critical', 'High')`;
        const conns = await sql`SELECT asset_id, connection_name, risk_level FROM asset_ext_connections WHERE risk_level IN ('Critical', 'High')`;
        data = [...apiKeys, ...users, ...conns];
      } else if (report_type === 'connector_health') {
        data = await sql`
          SELECT c.name, c.type, c.sync_status, c.last_sync, c.consecutive_failures, c.is_enabled
          FROM connectors c ORDER BY c.created_at DESC
        `;
      }

      // Generate CSV
      if (data.length === 0) return res.json({ success: true, message: 'No data to report' });

      const headers = Object.keys(data[0]).map((h) => ({ id: h, title: h }));
      const csvStringifier = createObjectCsvStringifier({ header: headers });
      const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(data);

      // If email recipients provided, queue email (actual sending requires SMTP config)
      if (recipient_emails?.length) {
        logger.info(`Report generated for ${recipient_emails.join(', ')}. Email delivery requires SMTP config.`);
      }

      res.setHeader('Content-Disposition', `attachment; filename="${report_type}-${new Date().toISOString().split('T')[0]}.csv"`);
      res.setHeader('Content-Type', 'text/csv');
      res.send(csvContent);
    } catch (err) {
      logger.error('POST /reports/send-now error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── ALERT MANAGEMENT ROUTES ─────────────────────────────────────────────────

/**
 * GET /api/v1/alerts
 * List alerts with optional filters
 */
assetRegistryRouter.get(
  '/alerts',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { status, severity, asset_id, page = '1', limit = '50' } = req.query as Record<string, string>;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const alerts = await sql`
        SELECT * FROM asset_alerts
        WHERE
          (${status || null} IS NULL OR status = ${status})
          AND (${severity || null} IS NULL OR severity = ${severity})
          AND (${asset_id || null} IS NULL OR asset_id = ${asset_id})
        ORDER BY created_at DESC
        LIMIT ${parseInt(limit)} OFFSET ${offset}
      `;

      const total = await sql`SELECT COUNT(*) FROM asset_alerts
        WHERE (${status || null} IS NULL OR status = ${status})
        AND (${severity || null} IS NULL OR severity = ${severity})`;

      res.json({ success: true, data: alerts, total: parseInt(total[0].count), page: parseInt(page) });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/alerts/:id/acknowledge
 */
assetRegistryRouter.post(
  '/alerts/:id/acknowledge',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      await sql`UPDATE asset_alerts SET status = 'Acknowledged', acknowledged_at = NOW(), acknowledged_by = ${req.user!.id} WHERE alert_id = ${req.params.id}`;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/alerts/:id/resolve
 */
assetRegistryRouter.post(
  '/alerts/:id/resolve',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      await sql`UPDATE asset_alerts SET status = 'Resolved', resolved_at = NOW(), resolved_by = ${req.user!.id} WHERE alert_id = ${req.params.id}`;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── ASSET RELATIONSHIPS ─────────────────────────────────────────────────────

assetRegistryRouter.post(
  '/relationships',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { source_asset_id, relationship_type, target_asset_id, notes } = req.body;
      const relId = `REL-${Date.now()}-${Math.random().toString(36).substring(5)}`;
      await sql`
        INSERT INTO asset_relationships (relationship_id, source_asset_id, relationship_type, target_asset_id, notes, created_by)
        VALUES (${relId}, ${source_asset_id}, ${relationship_type}, ${target_asset_id}, ${notes ?? null}, ${req.user!.id})
      `;
      res.status(201).json({ success: true, data: { relationship_id: relId } });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

assetRegistryRouter.get(
  '/relationships',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { asset_id } = req.query as Record<string, string>;
      const relationships = await sql`
        SELECT * FROM asset_relationships
        WHERE (${asset_id || null} IS NULL OR source_asset_id = ${asset_id} OR target_asset_id = ${asset_id})
        ORDER BY created_at DESC
      `;
      res.json({ success: true, data: relationships });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

assetRegistryRouter.delete(
  '/relationships/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      await sql`DELETE FROM asset_relationships WHERE relationship_id = ${req.params.id}`;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── CONNECTOR HEALTH MONITORING ─────────────────────────────────────────────

/**
 * GET /api/v1/connectors/:id/health
 * Get connector health: last 10 syncs sparkline data + streak info
 */
assetRegistryRouter.get(
  '/connectors/:id/health',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const recentSyncs = await sql`
        SELECT status, records_fetched, records_created, sync_started_at, sync_completed_at, error_message
        FROM connector_sync_log
        WHERE connector_id = (SELECT id FROM connectors WHERE connector_id = ${req.params.id})
        ORDER BY sync_started_at DESC LIMIT 10
      `;

      const connector = await sql`SELECT consecutive_failures, last_failure_at, is_enabled, sync_status FROM connectors WHERE connector_id = ${req.params.id}`;
      if (!connector.length) return res.status(404).json({ success: false, error: 'Not found' });

      const c = connector[0];
      const healthStatus =
        c.consecutive_failures >= 5 ? 'red' :
        c.consecutive_failures >= 3 ? 'amber' :
        c.sync_status === 'Success' ? 'green' :
        recentSyncs.length === 0 ? 'gray' : 'amber';

      res.json({
        success: true,
        data: {
          health_status: healthStatus,
          consecutive_failures: c.consecutive_failures || 0,
          is_enabled: c.is_enabled,
          last_failure_at: c.last_failure_at,
          recent_syncs: recentSyncs.reverse(), // Chronological for sparkline
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);
