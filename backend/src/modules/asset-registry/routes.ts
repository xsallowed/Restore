import { Router, Request, Response } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { sql, writeAuditEntry } from '../../lib/db';
import { requireAuth, requireMinTier } from '../../middleware/auth';
import { logger } from '../../lib/logger';
import {
  Asset,
  CreateAssetRequest,
  UpdateAssetRequest,
  AssetStatus,
  AssetType,
  AssetFilter,
  PaginationParams,
  PaginatedResponse,
  ApiResponse,
  AssetAuditLogEntry,
  Connector,
  ConnectorType,
  ConnectorSyncLog,
  Scan,
  ScanType,
  ScanStatus,
  ScanTargetType,
  CreateScanRequest,
  ScanResult,
  PostScanActions,
  ApiKey,
  UserIdentity,
  ExternalConnection,
  AssetRelationship,
  AssetAlert,
  CreateApiKeyRequest,
  CreateUserIdentityRequest,
  CreateExternalConnectionRequest,
  RiskLevel,
} from './types';
import { RiskCalculator } from './risk-calculator';
import { encryptConfig, decryptConfig, ConnectorFactory } from './connectors';
import { IntuneConnector } from './connectors/intune';

export const assetRegistryRouter = Router();

// ─── Register Available Connectors ──────────────────────────────────────────
// These would be registered at startup in a production application
try {
  ConnectorFactory.register('intune', IntuneConnector);
} catch (err) {
  logger.debug('Connector registration note', { err: String(err) });
}

// ─── Asset CRUD Operations ──────────────────────────────────────────────────

/**
 * GET /api/assets
 * List all assets with filtering, pagination, and search
 */
assetRegistryRouter.get(
  '/assets',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const search = req.query.search as string | undefined;
      const status = (req.query.status as string)?.split(',') || [];
      const asset_type = (req.query.asset_type as string)?.split(',') || [];
      const discovery_source = (req.query.discovery_source as string)?.split(',') || [];
      const sort_by = req.query.sort_by as string || 'created_at';
      const sort_order = (req.query.sort_order as string || 'desc').toUpperCase() as 'ASC' | 'DESC';

      const offset = (page - 1) * limit;

      // Build query conditions
      let whereConditions: string[] = [];
      const params: unknown[] = [];

      if (search) {
        whereConditions.push(
          `(hostname ILIKE $${params.length + 1} OR display_name ILIKE $${params.length + 1} OR primary_ip_address::text ILIKE $${params.length + 1})`
        );
        params.push(`%${search}%`);
      }

      if (status.length > 0) {
        whereConditions.push(`status = ANY($${params.length + 1})`);
        params.push(status);
      }

      if (asset_type.length > 0) {
        whereConditions.push(`asset_type = ANY($${params.length + 1})`);
        params.push(asset_type);
      }

      if (discovery_source.length > 0) {
        whereConditions.push(`discovery_source = ANY($${params.length + 1})`);
        params.push(discovery_source);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Count total
      const countResult = await sql<{ count: number }[]>`
        SELECT COUNT(*) as count FROM assets ${sql.unsafe(whereClause)}
      `;
      const total = parseInt(String(countResult[0]?.count || 0));
      const total_pages = Math.ceil(total / limit);

      // Fetch paginated results
      const assets = await sql<Asset[]>`
        SELECT * FROM assets 
        ${sql.unsafe(whereClause)}
        ORDER BY ${sql.unsafe(sort_by)} ${sql.unsafe(sort_order)}
        LIMIT ${limit} OFFSET ${offset}
      `;

      const response: PaginatedResponse<Asset> = {
        success: true,
        data: assets,
        total,
        page,
        limit,
        total_pages,
      };

      res.json(response);
    } catch (err) {
      logger.error('GET /assets error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/assets/:id
 * Get single asset with related data
 */
assetRegistryRouter.get(
  '/assets/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const assets = await sql<Asset[]>`
        SELECT * FROM assets WHERE id = ${id}
      `;

      if (!assets.length) {
        return res.status(404).json({ success: false, error: 'Asset not found' });
      }

      const asset = assets[0];

      // Get related data
      const [software, interfaces, health_checks, audit_log] = await Promise.all([
        sql`SELECT * FROM asset_software WHERE asset_id = ${id}`,
        sql`SELECT * FROM asset_network_interfaces WHERE asset_id = ${id}`,
        sql`SELECT * FROM health_check_results WHERE asset_id = ${id} ORDER BY last_checked DESC LIMIT 10`,
        sql`SELECT * FROM asset_audit_log WHERE asset_id = ${id} ORDER BY created_at DESC LIMIT 20`,
      ]);

      const response = {
        success: true,
        data: {
          ...asset,
          software,
          interfaces,
          health_checks,
          audit_log,
        },
      };

      res.json(response);
    } catch (err) {
      logger.error('GET /assets/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/assets
 * Create new asset
 */
assetRegistryRouter.post(
  '/assets',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        hostname: z.string().min(1),
        display_name: z.string().optional(),
        asset_type: z.nativeEnum(AssetType).default('Unknown'),
        primary_ip_address: z.string().optional(),
        secondary_ip_addresses: z.array(z.string()).default([]),
        mac_addresses: z.array(z.string()).default([]),
        os_name: z.string().optional(),
        os_version: z.string().optional(),
        os_build: z.string().optional(),
        manufacturer: z.string().optional(),
        model: z.string().optional(),
        serial_number: z.string().optional(),
        cpu_cores: z.number().optional(),
        ram_gb: z.number().optional(),
        storage_gb: z.number().optional(),
        site_name: z.string().optional(),
        building: z.string().optional(),
        room: z.string().optional(),
        rack_name: z.string().optional(),
        rack_position: z.number().optional(),
        business_unit: z.string().optional(),
        owner_name: z.string().optional(),
        owner_email: z.string().optional(),
        owner_phone: z.string().optional(),
        secondary_contact_name: z.string().optional(),
        secondary_contact_email: z.string().optional(),
        status: z.nativeEnum(AssetStatus).default('Active'),
        purchase_date: z.string().optional(),
        warranty_expiry_date: z.string().optional(),
        end_of_life_date: z.string().optional(),
        tags: z.array(z.string()).default([]),
        notes: z.string().optional(),
      });

      const data = schema.parse(req.body);
      const asset_id = `AST-${Date.now()}`; // Generate unique asset_id

      const [newAsset] = await sql<Asset[]>`
        INSERT INTO assets (
          asset_id, hostname, display_name, asset_type,
          primary_ip_address, secondary_ip_addresses, mac_addresses,
          os_name, os_version, os_build,
          manufacturer, model, serial_number, cpu_cores, ram_gb, storage_gb,
          site_name, building, room, rack_name, rack_position,
          business_unit, owner_name, owner_email, owner_phone, secondary_contact_name, secondary_contact_email,
          status, purchase_date, warranty_expiry_date, end_of_life_date,
          tags, notes, created_by, updated_by
        ) VALUES (
          ${asset_id}, ${data.hostname}, ${data.display_name ?? null}, ${data.asset_type},
          ${data.primary_ip_address ?? null}, ${data.secondary_ip_addresses}, ${data.mac_addresses},
          ${data.os_name ?? null}, ${data.os_version ?? null}, ${data.os_build ?? null},
          ${data.manufacturer ?? null}, ${data.model ?? null}, ${data.serial_number ?? null}, ${data.cpu_cores ?? null}, ${data.ram_gb ?? null}, ${data.storage_gb ?? null},
          ${data.site_name ?? null}, ${data.building ?? null}, ${data.room ?? null}, ${data.rack_name ?? null}, ${data.rack_position ?? null},
          ${data.business_unit ?? null}, ${data.owner_name ?? null}, ${data.owner_email ?? null}, ${data.owner_phone ?? null}, ${data.secondary_contact_name ?? null}, ${data.secondary_contact_email ?? null},
          ${data.status}, ${data.purchase_date ?? null}, ${data.warranty_expiry_date ?? null}, ${data.end_of_life_date ?? null},
          ${data.tags}, ${data.notes ?? null}, ${req.user!.id}, ${req.user!.id}
        )
        RETURNING *
      `;

      // Write audit log
      await writeAuditEntry({
        userId: req.user!.id,
        action: 'ASSET_CREATED',
        objectType: 'asset',
        objectId: newAsset.id,
        afterState: newAsset,
        ipAddress: req.ip,
      });

      res.status(201).json({ success: true, data: newAsset });
    } catch (err) {
      logger.error('POST /assets error', { err: String(err) });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * PUT /api/assets/:id
 * Update asset
 */
assetRegistryRouter.put(
  '/assets/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Fetch existing asset for audit trail
      const existingAssets = await sql<Asset[]>`SELECT * FROM assets WHERE id = ${id}`;
      if (!existingAssets.length) {
        return res.status(404).json({ success: false, error: 'Asset not found' });
      }

      const existingAsset = existingAssets[0];

      // Partial update schema
      const schema = z.object({
        hostname: z.string().min(1).optional(),
        display_name: z.string().optional(),
        asset_type: z.nativeEnum(AssetType).optional(),
        primary_ip_address: z.string().optional().nullable(),
        secondary_ip_addresses: z.array(z.string()).optional(),
        mac_addresses: z.array(z.string()).optional(),
        os_name: z.string().optional().nullable(),
        os_version: z.string().optional().nullable(),
        os_build: z.string().optional().nullable(),
        manufacturer: z.string().optional().nullable(),
        model: z.string().optional().nullable(),
        serial_number: z.string().optional().nullable(),
        cpu_cores: z.number().optional().nullable(),
        ram_gb: z.number().optional().nullable(),
        storage_gb: z.number().optional().nullable(),
        site_name: z.string().optional().nullable(),
        building: z.string().optional().nullable(),
        room: z.string().optional().nullable(),
        rack_name: z.string().optional().nullable(),
        rack_position: z.number().optional().nullable(),
        business_unit: z.string().optional().nullable(),
        owner_name: z.string().optional().nullable(),
        owner_email: z.string().optional().nullable(),
        owner_phone: z.string().optional().nullable(),
        secondary_contact_name: z.string().optional().nullable(),
        secondary_contact_email: z.string().optional().nullable(),
        status: z.nativeEnum(AssetStatus).optional(),
        verification_status: z.string().optional().nullable(),
        purchase_date: z.string().optional().nullable(),
        warranty_expiry_date: z.string().optional().nullable(),
        end_of_life_date: z.string().optional().nullable(),
        tags: z.array(z.string()).optional(),
        notes: z.string().optional().nullable(),
      }).partial();

      const data = schema.parse(req.body);

      // Build update query dynamically
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramCount = 0;

      Object.entries(data).forEach(([key, value]) => {
        paramCount++;
        updates.push(`${key} = $${paramCount}`);
        values.push(value !== undefined ? value : null);
      });

      if (updates.length === 0) {
        return res.status(400).json({ success: false, error: 'No fields to update' });
      }

      paramCount++;
      updates.push(`updated_at = $${paramCount}`);
      values.push(new Date());

      paramCount++;
      updates.push(`updated_by = $${paramCount}`);
      values.push(req.user!.id);

      paramCount++;
      const [updatedAsset] = await sql<Asset[]>`
        UPDATE assets SET ${sql.unsafe(updates.join(', '))}
        WHERE id = ${id}
        RETURNING *
      `;

      // Write audit log with changed fields
      const changedFields: Record<string, { old: unknown; new: unknown }> = {};
      Object.entries(data).forEach(([key, value]) => {
        changedFields[key] = {
          old: (existingAsset as Record<string, unknown>)[key],
          new: value,
        };
      });

      await writeAuditEntry({
        userId: req.user!.id,
        action: 'ASSET_UPDATED',
        objectType: 'asset',
        objectId: id,
        beforeState: existingAsset,
        afterState: updatedAsset,
        ipAddress: req.ip,
      });

      res.json({ success: true, data: updatedAsset });
    } catch (err) {
      logger.error('PUT /assets/:id error', { err: String(err) });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/assets/:id
 * Delete asset
 */
assetRegistryRouter.delete(
  '/assets/:id',
  requireAuth,
  requireMinTier('ADMIN'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Fetch asset for audit trail
      const assets = await sql<Asset[]>`SELECT * FROM assets WHERE id = ${id}`;
      if (!assets.length) {
        return res.status(404).json({ success: false, error: 'Asset not found' });
      }

      const asset = assets[0];

      // Delete asset (cascades to related data)
      await sql`DELETE FROM assets WHERE id = ${id}`;

      // Write audit log
      await writeAuditEntry({
        userId: req.user!.id,
        action: 'ASSET_DELETED',
        objectType: 'asset',
        objectId: id,
        beforeState: asset,
        ipAddress: req.ip,
      });

      res.status(204).send();
    } catch (err) {
      logger.error('DELETE /assets/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/assets/bulk-edit
 * Bulk update multiple assets
 */
assetRegistryRouter.post(
  '/assets/bulk-edit',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        asset_ids: z.array(z.string()).min(1),
        updates: z.record(z.unknown()).min(1),
      });

      const { asset_ids, updates } = schema.parse(req.body);

      // Build update columns
      const updateKeys = Object.keys(updates);
      const updateClauses = updateKeys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
      const updateValues = Object.values(updates);

      updateValues.push(new Date());
      updateValues.push(req.user!.id);

      const paramCount = updateValues.length;

      const updated = await sql<Asset[]>`
        UPDATE assets 
        SET ${sql.unsafe(updateClauses)}, updated_at = $${paramCount - 1}, updated_by = $${paramCount}
        WHERE id = ANY($${paramCount + 1})
        RETURNING *
      `;

      res.json({ success: true, data: updated, count: updated.length });
    } catch (err) {
      logger.error('POST /assets/bulk-edit error', { err: String(err) });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/assets/:id/audit-log
 * Get asset audit trail
 */
assetRegistryRouter.get(
  '/assets/:id/audit-log',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;

      const logs = await sql<AssetAuditLogEntry[]>`
        SELECT * FROM asset_audit_log 
        WHERE asset_id = ${id}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

      res.json({ success: true, data: logs });
    } catch (err) {
      logger.error('GET /assets/:id/audit-log error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── CSV Import Operations ──────────────────────────────────────────────────

/**
 * GET /api/import/template
 * Download CSV import template
 */
assetRegistryRouter.get(
  '/import/template',
  requireAuth,
  requireMinTier('SILVER'),
  async (_req: Request, res: Response) => {
    try {
      const headers = [
        'hostname',
        'display_name',
        'asset_type',
        'primary_ip_address',
        'mac_addresses',
        'os_name',
        'os_version',
        'manufacturer',
        'model',
        'serial_number',
        'cpu_cores',
        'ram_gb',
        'storage_gb',
        'site_name',
        'building',
        'business_unit',
        'owner_name',
        'owner_email',
        'status',
        'tags',
        'notes',
      ];

      const csv = headers.join(',');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="asset-template.csv"');
      res.send(csv);
    } catch (err) {
      logger.error('GET /import/template error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/import/validate
 * Validate CSV file and prepare for import
 */
assetRegistryRouter.post(
  '/import/validate',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        filename: z.string(),
        csv_content: z.string(),
      });

      const { filename, csv_content } = schema.parse(req.body);

      // Parse CSV
      const lines = csv_content.split('\n').filter((line) => line.trim());
      if (lines.length < 2) {
        return res.status(400).json({ success: false, error: 'CSV must contain headers and at least one row' });
      }

      const headers = lines[0].split(',').map((h) => h.trim());
      const rows: Record<string, unknown>[] = [];
      const errors: { row: number; message: string }[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim());
        const row: Record<string, unknown> = {};

        headers.forEach((header, idx) => {
          row[header] = values[idx] || null;
        });

        // Basic validation
        if (!row['hostname']) {
          errors.push({ row: i + 1, message: 'Hostname is required' });
          continue;
        }

        rows.push(row);
      }

      // Create import session
      const [session] = await sql<{ id: string }[]>`
        INSERT INTO csv_import_sessions (
          filename, file_size, total_rows, field_mapping, status, created_by
        ) VALUES (
          ${filename},
          ${csv_content.length},
          ${rows.length},
          ${sql.json({ headers })},
          'Validated',
          ${req.user!.id}
        )
        RETURNING id
      `;

      // Store rows in temp table for later processing
      if (rows.length > 0) {
        const rowsToInsert = rows.map((row) => ({
          row_data: row,
          row_number: rows.indexOf(row) + 1,
        }));

        for (const rowData of rowsToInsert) {
          await sql`
            INSERT INTO import_row_errors (import_session_id, row_number, row_data, error_message)
            VALUES (${session.id}, ${rowData.row_number}, ${sql.json(rowData.row_data)}, NULL)
          `;
        }
      }

      res.json({
        success: true,
        data: {
          session_id: session.id,
          total_rows: rows.length,
          error_count: errors.length,
          errors,
          preview: rows.slice(0, 5),
        },
      });
    } catch (err) {
      logger.error('POST /import/validate error', { err: String(err) });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/import/process
 * Process validated CSV and create assets
 */
assetRegistryRouter.post(
  '/import/process',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        session_id: z.string(),
      });

      const { session_id } = schema.parse(req.body);

      // Get import session
      const sessions = await sql<{ id: string; status: string; created_by: string }[]>`
        SELECT id, status, created_by FROM csv_import_sessions WHERE id = ${session_id}
      `;

      if (!sessions.length) {
        return res.status(404).json({ success: false, error: 'Import session not found' });
      }

      const session = sessions[0];

      // Get rows to import
      const rows = await sql<{ row_data: Record<string, unknown> }[]>`
        SELECT row_data FROM import_row_errors
        WHERE import_session_id = ${session_id} AND error_message IS NULL
      `;

      let successful = 0;
      let failed = 0;

      for (const rowRecord of rows) {
        const row = rowRecord.row_data as Record<string, unknown>;

        try {
          const asset_id = `AST-${Date.now()}-${Math.random().toString(36).substring(7)}`;

          await sql`
            INSERT INTO assets (
              asset_id, hostname, display_name, asset_type,
              primary_ip_address, os_name, os_version,
              manufacturer, model, serial_number,
              cpu_cores, ram_gb, storage_gb,
              site_name, building, business_unit,
              owner_name, owner_email,
              status, tags, notes, created_by, updated_by, discovery_source
            ) VALUES (
              ${asset_id},
              ${row['hostname'] as string},
              ${(row['display_name'] as string) || null},
              ${(row['asset_type'] as string) || 'Unknown'},
              ${(row['primary_ip_address'] as string) || null},
              ${(row['os_name'] as string) || null},
              ${(row['os_version'] as string) || null},
              ${(row['manufacturer'] as string) || null},
              ${(row['model'] as string) || null},
              ${(row['serial_number'] as string) || null},
              ${row['cpu_cores'] ? parseInt(row['cpu_cores'] as string) : null},
              ${row['ram_gb'] ? parseInt(row['ram_gb'] as string) : null},
              ${row['storage_gb'] ? parseInt(row['storage_gb'] as string) : null},
              ${(row['site_name'] as string) || null},
              ${(row['building'] as string) || null},
              ${(row['business_unit'] as string) || null},
              ${(row['owner_name'] as string) || null},
              ${(row['owner_email'] as string) || null},
              ${(row['status'] as string) || 'Active'},
              ${row['tags'] ? (row['tags'] as string).split(';') : []},
              ${(row['notes'] as string) || null},
              ${req.user!.id},
              ${req.user!.id},
              'CSV Import'
            )
          `;

          successful++;
        } catch (err) {
          logger.error('Failed to import asset row', { err: String(err), row });
          failed++;
        }
      }

      // Update session
      await sql`
        UPDATE csv_import_sessions
        SET status = 'Completed', successful_rows = ${successful}, failed_rows = ${failed}, completed_at = NOW()
        WHERE id = ${session_id}
      `;

      res.json({
        success: true,
        data: {
          session_id,
          successful_rows: successful,
          failed_rows: failed,
          total_rows: successful + failed,
        },
      });
    } catch (err) {
      logger.error('POST /import/process error', { err: String(err) });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── Connector Management ─────────────────────────────────────────────────────

/**
 * POST /api/connectors/test
 * Test connector configuration without saving
 */
assetRegistryRouter.post(
  '/connectors/test',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        type: z.string(),
        base_url: z.string().url(),
        auth_type: z.string(),
        endpoint: z.string(),
        pagination_type: z.string(),
        response_root_key: z.string().optional(),
        auth_config: z.record(z.any()).optional(),
      });

      const formData = schema.parse(req.body);

      // Simulate testing by making a sample request to the API
      try {
        // Build headers based on auth type
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (formData.auth_type === 'api_key' && formData.auth_config?.api_key) {
          const headerName = formData.auth_config.header_name || 'X-API-Key';
          headers[headerName] = formData.auth_config.api_key;
        } else if (formData.auth_type === 'bearer' && formData.auth_config?.token) {
          headers['Authorization'] = `Bearer ${formData.auth_config.token}`;
        } else if (formData.auth_type === 'basic' && formData.auth_config?.username && formData.auth_config?.password) {
          const credentials = Buffer.from(`${formData.auth_config.username}:${formData.auth_config.password}`).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        }

        // Make test request
        const response = await axios.get(
          `${formData.base_url}${formData.endpoint}?limit=1`,
          { headers, timeout: 10000 }
        );

        // Extract data from response
        let data = response.data;
        if (formData.response_root_key) {
          data = data[formData.response_root_key];
        }

        const recordsArray = Array.isArray(data) ? data : [data];
        const recordsCount = recordsArray.length;

        res.json({
          success: true,
          data: {
            auth_status: 'Valid',
            records_fetched: recordsCount,
            pagination_type: formData.pagination_type,
            estimated_total: recordsCount > 0 ? recordsCount : '?',
            sample_data: recordsArray.slice(0, 3),
          },
        });
      } catch (err: any) {
        res.json({
          success: true,
          data: {
            error: `Failed to connect: ${err.message || 'Unknown error'}`,
          },
        });
      }
    } catch (err) {
      logger.error('POST /connectors/test error', { err: String(err) });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/connectors
 * Create a new connector
 */
assetRegistryRouter.post(
  '/connectors',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        type: z.string(),
        base_url: z.string().url(),
        auth_type: z.string(),
        endpoint: z.string(),
        pagination_type: z.string(),
        response_root_key: z.string().optional(),
        schedule: z.string(),
        is_enabled: z.boolean(),
        auth_config: z.record(z.any()).optional(),
      });

      const formData = schema.parse(req.body);
      const connectorId = `CONN-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Encrypt sensitive auth data
      const encryptedAuthConfig = formData.auth_config ? encryptConfig(formData.auth_config) : null;

      await sql`
        INSERT INTO connectors (
          connector_id, name, type, base_url, auth_type, endpoint,
          pagination_type, response_root_key, schedule, is_enabled,
          auth_config, created_by, updated_by
        ) VALUES (
          ${connectorId}, ${formData.name}, ${formData.type}, ${formData.base_url},
          ${formData.auth_type}, ${formData.endpoint}, ${formData.pagination_type},
          ${formData.response_root_key || null}, ${formData.schedule}, ${formData.is_enabled},
          ${encryptedAuthConfig ? sql.json(encryptedAuthConfig) : null},
          ${req.user!.id}, ${req.user!.id}
        )
      `;

      await writeAuditEntry({
        action: 'CREATE',
        entity_type: 'CONNECTOR',
        entity_id: connectorId,
        changes: { created: true },
        user_id: req.user!.id,
      });

      res.status(201).json({
        success: true,
        data: {
          connector_id: connectorId,
          name: formData.name,
        },
      });
    } catch (err) {
      logger.error('POST /connectors error', { err: String(err) });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/connectors
 * List all connectors
 */
assetRegistryRouter.get(
  '/connectors',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const connectors = await sql<Connector[]>`
        SELECT * FROM connectors ORDER BY created_at DESC
      `;

      res.json({
        success: true,
        data: connectors.map((c) => ({
          ...c,
          auth_config: undefined, // Don't send encrypted config to frontend
        })),
      });
    } catch (err) {
      logger.error('GET /connectors error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/connectors/:id
 * Delete a connector
 */
assetRegistryRouter.delete(
  '/connectors/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await sql`
        DELETE FROM connectors WHERE connector_id = ${id} RETURNING connector_id
      `;

      if (!result.length) {
        return res.status(404).json({ success: false, error: 'Connector not found' });
      }

      await writeAuditEntry({
        action: 'DELETE',
        entity_type: 'CONNECTOR',
        entity_id: id,
        changes: { deleted: true },
        user_id: req.user!.id,
      });

      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /connectors/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/connectors/:id/sync
 * Trigger a manual sync for a connector
 */
assetRegistryRouter.post(
  '/connectors/:id/sync',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify connector exists
      const connectors = await sql<Connector[]>`
        SELECT * FROM connectors WHERE connector_id = ${id}
      `;

      if (!connectors.length) {
        return res.status(404).json({ success: false, error: 'Connector not found' });
      }

      const connector = connectors[0];

      // Log sync initiation
      const syncLogId = `SYNC-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      await sql`
        INSERT INTO connector_sync_log (sync_log_id, connector_id, status, started_at, started_by)
        VALUES (${syncLogId}, ${id}, 'Running', NOW(), ${req.user!.id})
      `;

      // In a production system, this would queue an async job
      // For now, we'll just acknowledge the sync was initiated
      res.json({
        success: true,
        data: {
          sync_log_id: syncLogId,
          status: 'Sync initiated - check back soon for results',
        },
      });

      await writeAuditEntry({
        action: 'SYNC',
        entity_type: 'CONNECTOR',
        entity_id: id,
        changes: { sync_initiated: true },
        user_id: req.user!.id,
      });
    } catch (err) {
      logger.error('POST /connectors/:id/sync error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── SCAN MANAGEMENT ────────────────────────────────────────────────────────

/**
 * POST /api/scans
 * Create a new scan configuration
 */
assetRegistryRouter.post(
  '/scans',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        scan_type: z.string(),
        target_type: z.string(),
        target_spec: z.object({
          type: z.string(),
          value: z.string(),
          asset_group_id: z.string().optional(),
        }),
        port_config: z.object({
          preset: z.string().optional(),
          custom_ports: z.string().optional(),
        }).optional(),
        timing: z.string(),
        credentials: z.object({
          type: z.string(),
          username: z.string(),
          password: z.string().optional(),
          domain: z.string().optional(),
        }).optional(),
        schedule_type: z.string(),
        scheduled_datetime: z.string().optional(),
        schedule_cron: z.string().optional(),
        post_scan_actions: z.object({
          create_new_assets: z.boolean(),
          update_existing_assets: z.boolean(),
          flag_unresponsive: z.boolean(),
          send_alert_new_hosts: z.boolean(),
          add_to_discovery_inbox: z.boolean(),
        }),
      });

      const payload = schema.parse(req.body);
      const scanId = `SCAN-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Encrypt credentials if provided
      const encryptedCredentials = payload.credentials ? encryptConfig(payload.credentials) : null;

      await sql`
        INSERT INTO scans (
          scan_id, name, description, scan_type, target_type,
          target_spec, port_config, timing,
          credentials, schedule_type, scheduled_datetime, schedule_cron,
          post_scan_actions, status, created_by, updated_by
        ) VALUES (
          ${scanId}, ${payload.name}, ${payload.description || null},
          ${payload.scan_type}, ${payload.target_type},
          ${sql.json(payload.target_spec)},
          ${payload.port_config ? sql.json(payload.port_config) : null},
          ${payload.timing},
          ${encryptedCredentials ? Buffer.from(encryptedCredentials) : null},
          ${payload.schedule_type},
          ${payload.scheduled_datetime || null},
          ${payload.schedule_cron || null},
          ${sql.json(payload.post_scan_actions)},
          'Queued',
          ${req.user!.id}, ${req.user!.id}
        )
      `;

      await writeAuditEntry({
        action: 'CREATE',
        entity_type: 'SCAN',
        entity_id: scanId,
        changes: { created: true, scan_type: payload.scan_type },
        user_id: req.user!.id,
      });

      res.status(201).json({
        success: true,
        data: {
          scan_id: scanId,
          name: payload.name,
          status: 'Queued',
        },
      });
    } catch (err) {
      logger.error('POST /scans error', { err: String(err) });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/scans
 * List all scans with filtering and pagination
 */
assetRegistryRouter.get(
  '/scans',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string | undefined;
      const scan_type = req.query.scan_type as string | undefined;

      const offset = (page - 1) * limit;

      // Build where clause
      let whereConditions: string[] = [];
      const params: unknown[] = [];

      if (status) {
        whereConditions.push(`status = $${params.length + 1}`);
        params.push(status);
      }

      if (scan_type) {
        whereConditions.push(`scan_type = $${params.length + 1}`);
        params.push(scan_type);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Count total
      const countResult = await sql<{ count: number }[]>`
        SELECT COUNT(*) as count FROM scans ${sql.unsafe(whereClause)}
      `;
      const total = parseInt(String(countResult[0]?.count || 0));
      const total_pages = Math.ceil(total / limit);

      // Fetch scans
      const scans = await sql<Scan[]>`
        SELECT * FROM scans
        ${sql.unsafe(whereClause)}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      res.json({
        success: true,
        data: scans,
        total,
        page,
        limit,
        total_pages,
      });
    } catch (err) {
      logger.error('GET /scans error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/scans/:id
 * Get scan details
 */
assetRegistryRouter.get(
  '/scans/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const scans = await sql<Scan[]>`
        SELECT * FROM scans WHERE scan_id = ${id}
      `;

      if (!scans.length) {
        return res.status(404).json({ success: false, error: 'Scan not found' });
      }

      res.json({
        success: true,
        data: scans[0],
      });
    } catch (err) {
      logger.error('GET /scans/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/scans/:id
 * Delete a scan
 */
assetRegistryRouter.delete(
  '/scans/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await sql`
        DELETE FROM scans WHERE scan_id = ${id} RETURNING scan_id
      `;

      if (!result.length) {
        return res.status(404).json({ success: false, error: 'Scan not found' });
      }

      await writeAuditEntry({
        action: 'DELETE',
        entity_type: 'SCAN',
        entity_id: id,
        changes: { deleted: true },
        user_id: req.user!.id,
      });

      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /scans/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/scans/:id/run
 * Start execution of a scan
 */
assetRegistryRouter.post(
  '/scans/:id/run',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verify scan exists
      const scans = await sql<Scan[]>`
        SELECT * FROM scans WHERE scan_id = ${id}
      `;

      if (!scans.length) {
        return res.status(404).json({ success: false, error: 'Scan not found' });
      }

      // Update scan status to Running
      await sql`
        UPDATE scans
        SET status = 'Running', started_at = NOW()
        WHERE scan_id = ${id}
      `;

      // Log audit entry
      await writeAuditEntry({
        action: 'RUN',
        entity_type: 'SCAN',
        entity_id: id,
        changes: { status: 'Running' },
        user_id: req.user!.id,
      });

      // In a real implementation, this would queue the scan to a background job processor
      // For now, just acknowledge that the scan has started
      res.json({
        success: true,
        data: {
          scan_id: id,
          status: 'Running',
          message: 'Scan execution started in background. Monitor progress using GET /scans/:id/progress',
        },
      });
    } catch (err) {
      logger.error('POST /scans/:id/run error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/scans/:id/progress
 * Get live scan progress
 */
assetRegistryRouter.get(
  '/scans/:id/progress',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Get scan details
      const scans = await sql<Scan[]>`
        SELECT * FROM scans WHERE scan_id = ${id}
      `;

      if (!scans.length) {
        return res.status(404).json({ success: false, error: 'Scan not found' });
      }

      const scan = scans[0];

      // Get progress logs
      const logs = await sql`
        SELECT * FROM scan_progress_log
        WHERE scan_id = ${id}
        ORDER BY timestamp DESC
        LIMIT 50
      `;

      res.json({
        success: true,
        data: {
          scan: scan,
          progress_logs: logs,
        },
      });
    } catch (err) {
      logger.error('GET /scans/:id/progress error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/scans/:id/results
 * Get scan results with filtering
 */
assetRegistryRouter.get(
  '/scans/:id/results',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const status = req.query.status as string | undefined;
      const has_open_ports = req.query.has_open_ports === 'true';

      // Verify scan exists
      const scans = await sql<Scan[]>`
        SELECT * FROM scans WHERE scan_id = ${id}
      `;

      if (!scans.length) {
        return res.status(404).json({ success: false, error: 'Scan not found' });
      }

      // Build where clause
      let whereConditions = ['scan_id = $1'];
      const params: unknown[] = [id];

      if (status) {
        whereConditions.push(`status = $${params.length + 1}`);
        params.push(status);
      }

      const whereClause = whereConditions.join(' AND ');

      // Get results
      let query = `
        SELECT * FROM scan_results
        WHERE ${whereClause}
        ORDER BY target_ip ASC
      `;

      const results = await sql<ScanResult[]>(query, params as [string, ...any[]]);

      // Filter by has_open_ports if requested
      const filtered = has_open_ports
        ? results.filter((r) => Array.isArray(r.open_ports) && r.open_ports.length > 0)
        : results;

      res.json({
        success: true,
        data: filtered,
        total: filtered.length,
      });
    } catch (err) {
      logger.error('GET /scans/:id/results error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/scans/:id/cancel
 * Cancel a running scan
 */
assetRegistryRouter.post(
  '/scans/:id/cancel',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      await sql`
        UPDATE scans
        SET status = 'Cancelled'
        WHERE scan_id = ${id} AND status = 'Running'
      `;

      await writeAuditEntry({
        action: 'CANCEL',
        entity_type: 'SCAN',
        entity_id: id,
        changes: { status: 'Cancelled' },
        user_id: req.user!.id,
      });

      res.json({ success: true });
    } catch (err) {
      logger.error('POST /scans/:id/cancel error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── API KEYS & SECRETS MANAGEMENT ──────────────────────────────────────────

/**
 * POST /api/v1/api-keys
 * Create a new API Key / Secret record
 */
assetRegistryRouter.post(
  '/api-keys',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        key_name: z.string().min(1),
        secret_type: z.string(),
        platform: z.string(),
        owner_team: z.string().optional(),
        owner_email: z.string().optional(),
        permission_scope: z.string().optional(),
        environment: z.string(),
        where_stored: z.string().optional(),
        rotation_interval: z.number().optional(),
        auto_rotate: z.boolean().optional(),
        expiry_date: z.string().optional(),
        associated_service: z.string().optional(),
        notes: z.string().optional(),
      });

      const payload = schema.parse(req.body);
      const assetId = `API-KEY-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Build the API Key record
      const apiKey: ApiKey = {
        asset_id: assetId,
        key_name: payload.key_name,
        secret_type: payload.secret_type as any,
        platform: payload.platform as any,
        owner_team: payload.owner_team,
        owner_email: payload.owner_email,
        created_by: req.user!.id,
        environment: payload.environment as any,
        where_stored: payload.where_stored,
        exposed_in_code: false,
        permission_scope: payload.permission_scope,
        rotation_interval: payload.rotation_interval,
        auto_rotate: payload.auto_rotate || false,
        expiry_date: payload.expiry_date,
        associated_service: payload.associated_service,
        status: 'Active',
        risk_level: 'Low' as any,
        confidence_score: 50,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Calculate risk level
      const riskResult = RiskCalculator.calculateApiKeyRisk(apiKey);
      apiKey.risk_level = riskResult.risk_level;

      // Insert into database
      await sql`
        INSERT INTO api_keys (
          asset_id, key_name, secret_type, platform,
          owner_team, owner_email, created_by,
          environment, where_stored, exposed_in_code,
          permission_scope, rotation_interval, auto_rotate,
          expiry_date, associated_service, status, risk_level,
          confidence_score, tags, notes, created_at, updated_at
        ) VALUES (
          ${apiKey.asset_id}, ${apiKey.key_name}, ${apiKey.secret_type},
          ${apiKey.platform}, ${apiKey.owner_team}, ${apiKey.owner_email},
          ${apiKey.created_by}, ${apiKey.environment}, ${apiKey.where_stored},
          ${apiKey.exposed_in_code}, ${apiKey.permission_scope},
          ${apiKey.rotation_interval}, ${apiKey.auto_rotate},
          ${apiKey.expiry_date}, ${apiKey.associated_service},
          ${apiKey.status}, ${apiKey.risk_level},
          ${apiKey.confidence_score}, ${apiKey.tags || sql.array([])},
          ${payload.notes || null}, NOW(), NOW()
        )
      `;

      await writeAuditEntry({
        action: 'CREATE',
        entity_type: 'API_KEY',
        entity_id: assetId,
        changes: { created: true, platform: payload.platform },
        user_id: req.user!.id,
      });

      res.status(201).json({
        success: true,
        data: apiKey,
      });
    } catch (err) {
      logger.error('POST /api-keys error', { err: String(err) });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/api-keys
 * List all API Keys with filtering and pagination
 */
assetRegistryRouter.get(
  '/api-keys',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const platform = req.query.platform as string | undefined;
      const risk_level = req.query.risk_level as string | undefined;
      const environment = req.query.environment as string | undefined;
      const search = req.query.search as string | undefined;

      const offset = (page - 1) * limit;

      // Build where clause
      let whereConditions: string[] = [];
      const params: unknown[] = [];

      if (platform) {
        whereConditions.push(`platform = $${params.length + 1}`);
        params.push(platform);
      }

      if (risk_level) {
        whereConditions.push(`risk_level = $${params.length + 1}`);
        params.push(risk_level);
      }

      if (environment) {
        whereConditions.push(`environment = $${params.length + 1}`);
        params.push(environment);
      }

      if (search) {
        whereConditions.push(`key_name ILIKE $${params.length + 1}`);
        params.push(`%${search}%`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Count total
      const countResult = await sql<{ count: number }[]>`
        SELECT COUNT(*) as count FROM api_keys ${sql.unsafe(whereClause)}
      `;
      const total = parseInt(String(countResult[0]?.count || 0));
      const total_pages = Math.ceil(total / limit);

      // Fetch API Keys
      const apiKeys = await sql<ApiKey[]>`
        SELECT * FROM api_keys
        ${sql.unsafe(whereClause)}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      res.json({
        success: true,
        data: apiKeys,
        total,
        page,
        limit,
        total_pages,
      });
    } catch (err) {
      logger.error('GET /api-keys error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/api-keys/:id
 * Get a specific API Key
 */
assetRegistryRouter.get(
  '/api-keys/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const keys = await sql<ApiKey[]>`
        SELECT * FROM api_keys WHERE asset_id = ${id}
      `;

      if (!keys.length) {
        return res.status(404).json({ success: false, error: 'API Key not found' });
      }

      res.json({
        success: true,
        data: keys[0],
      });
    } catch (err) {
      logger.error('GET /api-keys/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * PUT /api/v1/api-keys/:id
 * Update an API Key
 */
assetRegistryRouter.put(
  '/api-keys/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Fetch current key for risk recalculation
      const keys = await sql<ApiKey[]>`
        SELECT * FROM api_keys WHERE asset_id = ${id}
      `;

      if (!keys.length) {
        return res.status(404).json({ success: false, error: 'API Key not found' });
      }

      const current = keys[0];

      // Merge updates
      const updated: ApiKey = { ...current, ...updates, updated_at: new Date().toISOString() };

      // Recalculate risk
      const riskResult = RiskCalculator.calculateApiKeyRisk(updated);
      updated.risk_level = riskResult.risk_level;

      // Update in database
      await sql`
        UPDATE api_keys SET
          key_name = ${updated.key_name},
          secret_type = ${updated.secret_type},
          platform = ${updated.platform},
          owner_team = ${updated.owner_team},
          owner_email = ${updated.owner_email},
          environment = ${updated.environment},
          where_stored = ${updated.where_stored},
          exposure_in_code = ${updated.exposed_in_code},
          permission_scope = ${updated.permission_scope},
          rotation_interval = ${updated.rotation_interval},
          auto_rotate = ${updated.auto_rotate},
          expiry_date = ${updated.expiry_date},
          associated_service = ${updated.associated_service},
          status = ${updated.status},
          risk_level = ${updated.risk_level},
          confidence_score = ${updated.confidence_score},
          notes = ${updates.notes || null},
          updated_at = NOW()
        WHERE asset_id = ${id}
      `;

      await writeAuditEntry({
        action: 'UPDATE',
        entity_type: 'API_KEY',
        entity_id: id,
        changes: updates,
        user_id: req.user!.id,
      });

      res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      logger.error('PUT /api-keys/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/v1/api-keys/:id
 * Delete an API Key
 */
assetRegistryRouter.delete(
  '/api-keys/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await sql`
        DELETE FROM api_keys WHERE asset_id = ${id} RETURNING asset_id
      `;

      if (!result.length) {
        return res.status(404).json({ success: false, error: 'API Key not found' });
      }

      await writeAuditEntry({
        action: 'DELETE',
        entity_type: 'API_KEY',
        entity_id: id,
        changes: { deleted: true },
        user_id: req.user!.id,
      });

      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /api-keys/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── User Identities CRUD Operations ──────────────────────────────────────────

/**
 * POST /api/v1/users
 * Create a new User Identity record
 */
assetRegistryRouter.post(
  '/users',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        display_name: z.string().min(1),
        username: z.string().min(1),
        email: z.string().email(),
        user_type: z.string(),
        department: z.string().optional(),
        manager_email: z.string().optional(),
        account_status: z.string(),
        has_mfa: z.boolean().optional(),
        has_privileged_access: z.boolean().optional(),
        last_login: z.string().optional(),
        expiry_date: z.string().optional(),
        is_dormant: z.boolean().optional(),
        is_orphaned: z.boolean().optional(),
        identity_provider: z.string().optional(),
        notes: z.string().optional(),
      });

      const payload = schema.parse(req.body);
      const assetId = `USER-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Build the User Identity record
      const userIdentity: UserIdentity = {
        asset_id: assetId,
        display_name: payload.display_name,
        username: payload.username,
        email: payload.email,
        user_type: payload.user_type as any,
        department: payload.department,
        manager_email: payload.manager_email,
        created_by: req.user!.id,
        account_status: payload.account_status as any,
        has_mfa: payload.has_mfa || false,
        has_privileged_access: payload.has_privileged_access || false,
        last_login: payload.last_login,
        expiry_date: payload.expiry_date,
        is_dormant: payload.is_dormant || false,
        is_orphaned: payload.is_orphaned || false,
        identity_provider: payload.identity_provider,
        status: 'Active',
        risk_level: 'Low' as any,
        confidence_score: 50,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Calculate risk level
      const riskResult = RiskCalculator.calculateUserRisk(userIdentity);
      userIdentity.risk_level = riskResult.risk_level;

      // Insert into database
      await sql`
        INSERT INTO user_identities (
          asset_id, display_name, username, email, user_type,
          department, manager_email, created_by, account_status,
          has_mfa, has_privileged_access, last_login, expiry_date,
          is_dormant, is_orphaned, identity_provider, status,
          risk_level, confidence_score, tags, notes, created_at, updated_at
        ) VALUES (
          ${userIdentity.asset_id}, ${userIdentity.display_name},
          ${userIdentity.username}, ${userIdentity.email},
          ${userIdentity.user_type}, ${userIdentity.department},
          ${userIdentity.manager_email}, ${userIdentity.created_by},
          ${userIdentity.account_status}, ${userIdentity.has_mfa},
          ${userIdentity.has_privileged_access}, ${userIdentity.last_login},
          ${userIdentity.expiry_date}, ${userIdentity.is_dormant},
          ${userIdentity.is_orphaned}, ${userIdentity.identity_provider},
          ${userIdentity.status}, ${userIdentity.risk_level},
          ${userIdentity.confidence_score}, ${userIdentity.tags || sql.array([])},
          ${payload.notes || null}, NOW(), NOW()
        )
      `;

      await writeAuditEntry({
        action: 'CREATE',
        entity_type: 'USER_IDENTITY',
        entity_id: assetId,
        changes: { created: true, username: payload.username },
        user_id: req.user!.id,
      });

      res.status(201).json({
        success: true,
        data: userIdentity,
      });
    } catch (err) {
      logger.error('POST /users error', { err: String(err) });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/users
 * List all User Identities with filtering and pagination
 */
assetRegistryRouter.get(
  '/users',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const user_type = req.query.user_type as string | undefined;
      const risk_level = req.query.risk_level as string | undefined;
      const search = req.query.search as string | undefined;

      const offset = (page - 1) * limit;

      // Build where clause
      let whereConditions: string[] = [];
      const params: unknown[] = [];

      if (user_type) {
        whereConditions.push(`user_type = $${params.length + 1}`);
        params.push(user_type);
      }

      if (risk_level) {
        whereConditions.push(`risk_level = $${params.length + 1}`);
        params.push(risk_level);
      }

      if (search) {
        whereConditions.push(`(display_name ILIKE $${params.length + 1} OR username ILIKE $${params.length + 1} OR email ILIKE $${params.length + 1})`);
        params.push(`%${search}%`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Count total
      const countResult = await sql<{ count: number }[]>`
        SELECT COUNT(*) as count FROM user_identities ${sql.unsafe(whereClause)}
      `;
      const total = parseInt(String(countResult[0]?.count || 0));
      const total_pages = Math.ceil(total / limit);

      // Fetch User Identities
      const users = await sql<UserIdentity[]>`
        SELECT * FROM user_identities
        ${sql.unsafe(whereClause)}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      res.json({
        success: true,
        data: users,
        total,
        page,
        limit,
        total_pages,
      });
    } catch (err) {
      logger.error('GET /users error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/users/:id
 * Get a specific User Identity
 */
assetRegistryRouter.get(
  '/users/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const users = await sql<UserIdentity[]>`
        SELECT * FROM user_identities WHERE asset_id = ${id}
      `;

      if (!users.length) {
        return res.status(404).json({ success: false, error: 'User Identity not found' });
      }

      res.json({
        success: true,
        data: users[0],
      });
    } catch (err) {
      logger.error('GET /users/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * PUT /api/v1/users/:id
 * Update a User Identity
 */
assetRegistryRouter.put(
  '/users/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Fetch current user for risk recalculation
      const users = await sql<UserIdentity[]>`
        SELECT * FROM user_identities WHERE asset_id = ${id}
      `;

      if (!users.length) {
        return res.status(404).json({ success: false, error: 'User Identity not found' });
      }

      const current = users[0];

      // Merge updates
      const updated: UserIdentity = { ...current, ...updates, updated_at: new Date().toISOString() };

      // Recalculate risk
      const riskResult = RiskCalculator.calculateUserRisk(updated);
      updated.risk_level = riskResult.risk_level;

      // Update in database
      await sql`
        UPDATE user_identities SET
          display_name = ${updated.display_name},
          username = ${updated.username},
          email = ${updated.email},
          user_type = ${updated.user_type},
          department = ${updated.department},
          manager_email = ${updated.manager_email},
          account_status = ${updated.account_status},
          has_mfa = ${updated.has_mfa},
          has_privileged_access = ${updated.has_privileged_access},
          last_login = ${updated.last_login},
          expiry_date = ${updated.expiry_date},
          is_dormant = ${updated.is_dormant},
          is_orphaned = ${updated.is_orphaned},
          identity_provider = ${updated.identity_provider},
          status = ${updated.status},
          risk_level = ${updated.risk_level},
          confidence_score = ${updated.confidence_score},
          notes = ${updates.notes || null},
          updated_at = NOW()
        WHERE asset_id = ${id}
      `;

      await writeAuditEntry({
        action: 'UPDATE',
        entity_type: 'USER_IDENTITY',
        entity_id: id,
        changes: updates,
        user_id: req.user!.id,
      });

      res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      logger.error('PUT /users/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/v1/users/:id
 * Delete a User Identity
 */
assetRegistryRouter.delete(
  '/users/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await sql`
        DELETE FROM user_identities WHERE asset_id = ${id} RETURNING asset_id
      `;

      if (!result.length) {
        return res.status(404).json({ success: false, error: 'User Identity not found' });
      }

      await writeAuditEntry({
        action: 'DELETE',
        entity_type: 'USER_IDENTITY',
        entity_id: id,
        changes: { deleted: true },
        user_id: req.user!.id,
      });

      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /users/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── External Connections CRUD Operations ─────────────────────────────────────

/**
 * POST /api/v1/connections
 * Create a new External Connection record
 */
assetRegistryRouter.post(
  '/connections',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        connection_name: z.string().min(1),
        connection_type: z.string(),
        source_system: z.string().optional(),
        destination_system: z.string().optional(),
        protocol: z.string(),
        encryption: z.string(),
        owner_team: z.string().optional(),
        owner_email: z.string().optional(),
        is_active: z.boolean().optional(),
        access_controls: z.string().optional(),
        last_monitored: z.string().optional(),
        notes: z.string().optional(),
      });

      const payload = schema.parse(req.body);
      const assetId = `CONN-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Build the External Connection record
      const connection: ExternalConnection = {
        asset_id: assetId,
        connection_name: payload.connection_name,
        connection_type: payload.connection_type as any,
        source_system: payload.source_system,
        destination_system: payload.destination_system,
        protocol: payload.protocol as any,
        encryption: payload.encryption as any,
        owner_team: payload.owner_team,
        owner_email: payload.owner_email,
        created_by: req.user!.id,
        is_active: payload.is_active ?? true,
        access_controls: payload.access_controls,
        last_monitored: payload.last_monitored,
        exposed: false,
        suspicious_activity: false,
        status: 'Active',
        risk_level: 'Low' as any,
        confidence_score: 50,
        tags: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Calculate risk level
      const riskResult = RiskCalculator.calculateConnectionRisk(connection);
      connection.risk_level = riskResult.risk_level;

      // Insert into database
      await sql`
        INSERT INTO external_connections (
          asset_id, connection_name, connection_type, source_system,
          destination_system, protocol, encryption, owner_team,
          owner_email, created_by, is_active, access_controls,
          last_monitored, exposed, suspicious_activity, status,
          risk_level, confidence_score, tags, notes, created_at, updated_at
        ) VALUES (
          ${connection.asset_id}, ${connection.connection_name},
          ${connection.connection_type}, ${connection.source_system},
          ${connection.destination_system}, ${connection.protocol},
          ${connection.encryption}, ${connection.owner_team},
          ${connection.owner_email}, ${connection.created_by},
          ${connection.is_active}, ${connection.access_controls},
          ${connection.last_monitored}, ${connection.exposed},
          ${connection.suspicious_activity}, ${connection.status},
          ${connection.risk_level}, ${connection.confidence_score},
          ${connection.tags || sql.array([])}, ${payload.notes || null},
          NOW(), NOW()
        )
      `;

      await writeAuditEntry({
        action: 'CREATE',
        entity_type: 'EXTERNAL_CONNECTION',
        entity_id: assetId,
        changes: { created: true, connection_type: payload.connection_type },
        user_id: req.user!.id,
      });

      res.status(201).json({
        success: true,
        data: connection,
      });
    } catch (err) {
      logger.error('POST /connections error', { err: String(err) });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/connections
 * List all External Connections with filtering and pagination
 */
assetRegistryRouter.get(
  '/connections',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const connection_type = req.query.connection_type as string | undefined;
      const risk_level = req.query.risk_level as string | undefined;
      const search = req.query.search as string | undefined;

      const offset = (page - 1) * limit;

      // Build where clause
      let whereConditions: string[] = [];
      const params: unknown[] = [];

      if (connection_type) {
        whereConditions.push(`connection_type = $${params.length + 1}`);
        params.push(connection_type);
      }

      if (risk_level) {
        whereConditions.push(`risk_level = $${params.length + 1}`);
        params.push(risk_level);
      }

      if (search) {
        whereConditions.push(`(connection_name ILIKE $${params.length + 1} OR source_system ILIKE $${params.length + 1} OR destination_system ILIKE $${params.length + 1})`);
        params.push(`%${search}%`);
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Count total
      const countResult = await sql<{ count: number }[]>`
        SELECT COUNT(*) as count FROM external_connections ${sql.unsafe(whereClause)}
      `;
      const total = parseInt(String(countResult[0]?.count || 0));
      const total_pages = Math.ceil(total / limit);

      // Fetch External Connections
      const connections = await sql<ExternalConnection[]>`
        SELECT * FROM external_connections
        ${sql.unsafe(whereClause)}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      res.json({
        success: true,
        data: connections,
        total,
        page,
        limit,
        total_pages,
      });
    } catch (err) {
      logger.error('GET /connections error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/connections/:id
 * Get a specific External Connection
 */
assetRegistryRouter.get(
  '/connections/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const connections = await sql<ExternalConnection[]>`
        SELECT * FROM external_connections WHERE asset_id = ${id}
      `;

      if (!connections.length) {
        return res.status(404).json({ success: false, error: 'External Connection not found' });
      }

      res.json({
        success: true,
        data: connections[0],
      });
    } catch (err) {
      logger.error('GET /connections/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * PUT /api/v1/connections/:id
 * Update an External Connection
 */
assetRegistryRouter.put(
  '/connections/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Fetch current connection for risk recalculation
      const connections = await sql<ExternalConnection[]>`
        SELECT * FROM external_connections WHERE asset_id = ${id}
      `;

      if (!connections.length) {
        return res.status(404).json({ success: false, error: 'External Connection not found' });
      }

      const current = connections[0];

      // Merge updates
      const updated: ExternalConnection = { ...current, ...updates, updated_at: new Date().toISOString() };

      // Recalculate risk
      const riskResult = RiskCalculator.calculateConnectionRisk(updated);
      updated.risk_level = riskResult.risk_level;

      // Update in database
      await sql`
        UPDATE external_connections SET
          connection_name = ${updated.connection_name},
          connection_type = ${updated.connection_type},
          source_system = ${updated.source_system},
          destination_system = ${updated.destination_system},
          protocol = ${updated.protocol},
          encryption = ${updated.encryption},
          owner_team = ${updated.owner_team},
          owner_email = ${updated.owner_email},
          is_active = ${updated.is_active},
          access_controls = ${updated.access_controls},
          last_monitored = ${updated.last_monitored},
          exposed = ${updated.exposed},
          suspicious_activity = ${updated.suspicious_activity},
          status = ${updated.status},
          risk_level = ${updated.risk_level},
          confidence_score = ${updated.confidence_score},
          notes = ${updates.notes || null},
          updated_at = NOW()
        WHERE asset_id = ${id}
      `;

      await writeAuditEntry({
        action: 'UPDATE',
        entity_type: 'EXTERNAL_CONNECTION',
        entity_id: id,
        changes: updates,
        user_id: req.user!.id,
      });

      res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      logger.error('PUT /connections/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/v1/connections/:id
 * Delete an External Connection
 */
assetRegistryRouter.delete(
  '/connections/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await sql`
        DELETE FROM external_connections WHERE asset_id = ${id} RETURNING asset_id
      `;

      if (!result.length) {
        return res.status(404).json({ success: false, error: 'External Connection not found' });
      }

      await writeAuditEntry({
        action: 'DELETE',
        entity_type: 'EXTERNAL_CONNECTION',
        entity_id: id,
        changes: { deleted: true },
        user_id: req.user!.id,
      });

      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /connections/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

// ─── Alert Engine Operations ──────────────────────────────────────────────────

/**
 * POST /api/v1/alerts/rules
 * Create a new alert rule
 */
assetRegistryRouter.post(
  '/alerts/rules',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        trigger_type: z.string(),
        asset_type: z.string(),
        condition: z.string(),
        threshold: z.number().optional(),
        recipient_email: z.string().email(),
        is_enabled: z.boolean().optional(),
        notification_frequency: z.string(),
      });

      const payload = schema.parse(req.body);
      const ruleId = `ALERT-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      await sql`
        INSERT INTO asset_alerts (
          rule_id, trigger_type, asset_type, condition, threshold,
          recipient_email, is_enabled, notification_frequency,
          created_by, created_at, updated_at
        ) VALUES (
          ${ruleId}, ${payload.trigger_type}, ${payload.asset_type},
          ${payload.condition}, ${payload.threshold || null},
          ${payload.recipient_email}, ${payload.is_enabled ?? true},
          ${payload.notification_frequency}, ${req.user!.id},
          NOW(), NOW()
        )
      `;

      await writeAuditEntry({
        action: 'CREATE',
        entity_type: 'ALERT_RULE',
        entity_id: ruleId,
        changes: { created: true, trigger_type: payload.trigger_type },
        user_id: req.user!.id,
      });

      res.status(201).json({ success: true, rule_id: ruleId });
    } catch (err) {
      logger.error('POST /alerts/rules error', { err: String(err) });
      if (err instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
      }
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/alerts/rules
 * List all alert rules
 */
assetRegistryRouter.get(
  '/alerts/rules',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;

      // Count total
      const countResult = await sql<{ count: number }[]>`
        SELECT COUNT(*) as count FROM asset_alerts
      `;
      const total = parseInt(String(countResult[0]?.count || 0));
      const total_pages = Math.ceil(total / limit);

      // Fetch rules
      const rules = await sql<AssetAlert[]>`
        SELECT * FROM asset_alerts
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      res.json({
        success: true,
        data: rules,
        total,
        page,
        limit,
        total_pages,
      });
    } catch (err) {
      logger.error('GET /alerts/rules error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/alerts/rules/:id
 * Get a specific alert rule
 */
assetRegistryRouter.get(
  '/alerts/rules/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const rules = await sql<AssetAlert[]>`
        SELECT * FROM asset_alerts WHERE rule_id = ${id}
      `;

      if (!rules.length) {
        return res.status(404).json({ success: false, error: 'Alert rule not found' });
      }

      res.json({ success: true, data: rules[0] });
    } catch (err) {
      logger.error('GET /alerts/rules/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * PUT /api/v1/alerts/rules/:id
 * Update an alert rule
 */
assetRegistryRouter.put(
  '/alerts/rules/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      await sql`
        UPDATE asset_alerts SET
          trigger_type = ${updates.trigger_type || null},
          asset_type = ${updates.asset_type || null},
          condition = ${updates.condition || null},
          threshold = ${updates.threshold || null},
          recipient_email = ${updates.recipient_email || null},
          is_enabled = ${updates.is_enabled !== undefined ? updates.is_enabled : null},
          notification_frequency = ${updates.notification_frequency || null},
          updated_at = NOW()
        WHERE rule_id = ${id}
      `;

      await writeAuditEntry({
        action: 'UPDATE',
        entity_type: 'ALERT_RULE',
        entity_id: id,
        changes: updates,
        user_id: req.user!.id,
      });

      res.json({ success: true });
    } catch (err) {
      logger.error('PUT /alerts/rules/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/v1/alerts/rules/:id
 * Delete an alert rule
 */
assetRegistryRouter.delete(
  '/alerts/rules/:id',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await sql`
        DELETE FROM asset_alerts WHERE rule_id = ${id} RETURNING rule_id
      `;

      if (!result.length) {
        return res.status(404).json({ success: false, error: 'Alert rule not found' });
      }

      await writeAuditEntry({
        action: 'DELETE',
        entity_type: 'ALERT_RULE',
        entity_id: id,
        changes: { deleted: true },
        user_id: req.user!.id,
      });

      res.json({ success: true });
    } catch (err) {
      logger.error('DELETE /alerts/rules/:id error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/v1/alerts/events
 * List all alert events with optional filtering
 */
assetRegistryRouter.get(
  '/alerts/events',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const unresolved = (req.query.unresolved as string)?.toLowerCase() === 'true';
      const offset = (page - 1) * limit;

      // Build where clause
      let whereClause = '';
      if (unresolved) {
        whereClause = 'WHERE is_resolved = false';
      }

      // Count total
      const countResult = await sql<{ count: number }[]>`
        SELECT COUNT(*) as count FROM exposed_secrets ${sql.unsafe(whereClause)}
      `;
      const total = parseInt(String(countResult[0]?.count || 0));
      const total_pages = Math.ceil(total / limit);

      // Fetch events
      const events = await sql<any[]>`
        SELECT * FROM exposed_secrets
        ${sql.unsafe(whereClause)}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      res.json({
        success: true,
        data: events,
        total,
        page,
        limit,
        total_pages,
      });
    } catch (err) {
      logger.error('GET /alerts/events error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/alerts/events/:id/resolve
 * Mark an alert event as resolved
 */
assetRegistryRouter.post(
  '/alerts/events/:id/resolve',
  requireAuth,
  requireMinTier('SILVER'),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const result = await sql`
        UPDATE exposed_secrets SET
          is_resolved = true,
          resolved_at = NOW()
        WHERE event_id = ${id}
        RETURNING event_id
      `;

      if (!result.length) {
        return res.status(404).json({ success: false, error: 'Alert event not found' });
      }

      await writeAuditEntry({
        action: 'UPDATE',
        entity_type: 'ALERT_EVENT',
        entity_id: id,
        changes: { resolved: true },
        user_id: req.user!.id,
      });

      res.json({ success: true });
    } catch (err) {
      logger.error('POST /alerts/events/:id/resolve error', { err: String(err) });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
);
