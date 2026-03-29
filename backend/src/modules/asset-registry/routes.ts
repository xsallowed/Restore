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
} from './types';
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
