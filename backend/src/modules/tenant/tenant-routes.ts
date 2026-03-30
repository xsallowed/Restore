import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { sql } from '../lib/db';
import {
  requireAuth, requireTenant, requireTenantAdmin,
  requireSuperAdmin, issueToken, RestoreTier,
} from '../middleware/auth';
import { logger } from '../lib/logger';

export const tenantRouter = Router();

// ─── TENANT REGISTRATION (public) ────────────────────────────────────────────

/**
 * POST /api/v1/tenants/register
 * Create a new tenant + first admin user in one step.
 */
tenantRouter.post('/tenants/register', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      // Tenant details
      org_name:    z.string().min(2).max(100),
      org_slug:    z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers and hyphens only'),
      plan:        z.enum(['starter', 'professional', 'enterprise']).default('starter'),
      // Admin user
      admin_name:  z.string().min(2),
      admin_email: z.string().email(),
      admin_password: z.string().min(8, 'Password must be at least 8 characters'),
    });

    const body = schema.parse(req.body);

    // Check slug is available
    const existing = await sql`SELECT id FROM tenants WHERE slug = ${body.org_slug}`;
    if (existing.length) {
      return res.status(409).json({ error: 'Organisation slug is already taken' });
    }

    // Create tenant
    const [tenant] = await sql`
      INSERT INTO tenants (slug, name, plan)
      VALUES (${body.org_slug}, ${body.org_name}, ${body.plan})
      RETURNING id, slug, name, plan
    `;

    // Create admin user
    const passwordHash = await bcrypt.hash(body.admin_password, 12);
    const [user] = await sql`
      INSERT INTO users (
        email, display_name, tier, roles, password_hash,
        tenant_id, is_tenant_admin, is_active
      ) VALUES (
        ${body.admin_email}, ${body.admin_name}, 'ADMIN',
        ARRAY['ADMIN']::text[], ${passwordHash},
        ${tenant.id}, TRUE, TRUE
      )
      RETURNING id, email, display_name, tier, roles, tenant_id, is_tenant_admin
    `;

    const token = issueToken({
      id: user.id, email: user.email, displayName: user.display_name,
      tier: user.tier as RestoreTier, roles: user.roles,
      tenant_id: tenant.id, tenant_slug: tenant.slug, is_tenant_admin: true,
    });

    logger.info('New tenant registered', { tenant: body.org_slug, admin: body.admin_email });

    res.status(201).json({
      data: {
        token,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, plan: tenant.plan },
        user: { id: user.id, email: user.email, displayName: user.display_name, tier: user.tier },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    logger.error('Tenant registration error', { err: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── AUTH: TENANT-SCOPED LOGIN ────────────────────────────────────────────────

/**
 * POST /api/v1/auth/login
 * Replaces the global login. Looks up user by email within the tenant.
 * Supports login by slug: POST body can include { tenant_slug } OR
 * the frontend can send the slug as a subdomain hint.
 */
tenantRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password, tenant_slug } = req.body as {
      email?: string; password?: string; tenant_slug?: string;
    };

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    let userQuery;

    if (tenant_slug) {
      // Login scoped to a specific tenant (slug passed by frontend)
      userQuery = await sql`
        SELECT u.id, u.email, u.display_name, u.tier, u.roles,
               u.password_hash, u.is_tenant_admin, u.tenant_id,
               t.slug AS tenant_slug, t.name AS tenant_name, t.is_active AS tenant_active
        FROM users u
        JOIN tenants t ON t.id = u.tenant_id
        WHERE u.email = ${email}
          AND t.slug = ${tenant_slug}
          AND u.is_active = TRUE
        LIMIT 1
      `;
    } else {
      // No slug: try to find the user (works if email is unique across all tenants — warn if ambiguous)
      userQuery = await sql`
        SELECT u.id, u.email, u.display_name, u.tier, u.roles,
               u.password_hash, u.is_tenant_admin, u.tenant_id,
               t.slug AS tenant_slug, t.name AS tenant_name, t.is_active AS tenant_active
        FROM users u
        LEFT JOIN tenants t ON t.id = u.tenant_id
        WHERE u.email = ${email}
          AND u.is_active = TRUE
        LIMIT 1
      `;
    }

    const user = userQuery[0];

    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.tenant_id && !user.tenant_active) {
      return res.status(403).json({ error: 'Your organisation account has been deactivated' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = issueToken({
      id: user.id, email: user.email, displayName: user.display_name,
      tier: user.tier as RestoreTier, roles: user.roles,
      tenant_id: user.tenant_id ?? null,
      tenant_slug: user.tenant_slug ?? null,
      is_tenant_admin: user.is_tenant_admin ?? false,
    });

    await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`;

    return res.json({
      data: {
        token,
        tenant: user.tenant_id
          ? { id: user.tenant_id, slug: user.tenant_slug, name: user.tenant_name }
          : null,
        user: {
          id: user.id, email: user.email,
          displayName: user.display_name, tier: user.tier,
          is_tenant_admin: user.is_tenant_admin,
        },
      },
    });
  } catch (err) {
    logger.error('Login error', { err: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/v1/auth/me
 * Returns current user + tenant context
 */
tenantRouter.get('/auth/me', requireAuth, (req: Request, res: Response) => {
  res.json({ data: req.user });
});

// ─── TENANT USER MANAGEMENT ───────────────────────────────────────────────────

/**
 * GET /api/v1/tenant/users
 * List all users in the current tenant
 */
tenantRouter.get(
  '/tenant/users',
  requireAuth, requireTenant, requireTenantAdmin,
  async (req: Request, res: Response) => {
    try {
      const users = await sql`
        SELECT id, email, display_name, tier, roles, is_tenant_admin,
               is_active, last_login_at, created_at
        FROM users
        WHERE tenant_id = ${req.tenantId}
        ORDER BY created_at ASC
      `;
      res.json({ data: users });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/tenant/users
 * Create a new user directly within the tenant (tenant admin only)
 */
tenantRouter.post(
  '/tenant/users',
  requireAuth, requireTenant, requireTenantAdmin,
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        email:        z.string().email(),
        display_name: z.string().min(1),
        password:     z.string().min(8),
        tier:         z.enum(['BRONZE', 'SILVER', 'GOLD', 'AUTHOR', 'ADMIN']).default('BRONZE'),
        is_tenant_admin: z.boolean().default(false),
      });
      const body = schema.parse(req.body);

      // Check tenant user limit
      const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users WHERE tenant_id = ${req.tenantId}`;
      const [tenant] = await sql`SELECT max_users FROM tenants WHERE id = ${req.tenantId}`;
      if (count >= tenant.max_users) {
        return res.status(429).json({ error: `User limit reached (${tenant.max_users}). Upgrade your plan to add more users.` });
      }

      // Check email not already in this tenant
      const existing = await sql`SELECT id FROM users WHERE email = ${body.email} AND tenant_id = ${req.tenantId}`;
      if (existing.length) {
        return res.status(409).json({ error: 'A user with that email already exists in this organisation' });
      }

      const passwordHash = await bcrypt.hash(body.password, 12);
      const [user] = await sql`
        INSERT INTO users (email, display_name, tier, roles, password_hash, tenant_id, is_tenant_admin, is_active)
        VALUES (${body.email}, ${body.display_name}, ${body.tier}, ARRAY[${body.tier}]::text[],
                ${passwordHash}, ${req.tenantId}, ${body.is_tenant_admin}, TRUE)
        RETURNING id, email, display_name, tier, is_tenant_admin, created_at
      `;

      res.status(201).json({ data: user });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * PATCH /api/v1/tenant/users/:userId
 * Update a user's tier, admin status, or active status
 */
tenantRouter.patch(
  '/tenant/users/:userId',
  requireAuth, requireTenant, requireTenantAdmin,
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        tier:            z.enum(['BRONZE','SILVER','GOLD','AUTHOR','ADMIN']).optional(),
        is_tenant_admin: z.boolean().optional(),
        is_active:       z.boolean().optional(),
        display_name:    z.string().optional(),
      });
      const body = schema.parse(req.body);

      // Verify user belongs to this tenant
      const users = await sql`SELECT id FROM users WHERE id = ${req.params.userId} AND tenant_id = ${req.tenantId}`;
      if (!users.length) return res.status(404).json({ error: 'User not found' });

      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (body.tier !== undefined)            updates.tier = body.tier;
      if (body.is_tenant_admin !== undefined) updates.is_tenant_admin = body.is_tenant_admin;
      if (body.is_active !== undefined)       updates.is_active = body.is_active;
      if (body.display_name !== undefined)    updates.display_name = body.display_name;

      const [updated] = await sql`
        UPDATE users SET ${sql(updates)} WHERE id = ${req.params.userId} RETURNING id, email, display_name, tier, is_tenant_admin, is_active
      `;
      res.json({ data: updated });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * DELETE /api/v1/tenant/users/:userId
 * Remove a user from the tenant
 */
tenantRouter.delete(
  '/tenant/users/:userId',
  requireAuth, requireTenant, requireTenantAdmin,
  async (req: Request, res: Response) => {
    try {
      // Prevent deleting yourself
      if (req.params.userId === req.user!.sub) {
        return res.status(400).json({ error: 'You cannot delete your own account' });
      }
      await sql`DELETE FROM users WHERE id = ${req.params.userId} AND tenant_id = ${req.tenantId}`;
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// ─── INVITATIONS ──────────────────────────────────────────────────────────────

/**
 * POST /api/v1/tenant/invitations
 * Invite a new user to the tenant by email
 */
tenantRouter.post(
  '/tenant/invitations',
  requireAuth, requireTenant, requireTenantAdmin,
  async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        email: z.string().email(),
        tier:  z.enum(['BRONZE','SILVER','GOLD','AUTHOR','ADMIN']).default('BRONZE'),
      });
      const body = schema.parse(req.body);
      const token = randomBytes(32).toString('hex');

      await sql`
        INSERT INTO tenant_invitations (tenant_id, email, tier, token, invited_by)
        VALUES (${req.tenantId}, ${body.email}, ${body.tier}, ${token}, ${req.user!.sub})
        ON CONFLICT DO NOTHING
      `;

      // In production: send email with invite link
      const inviteUrl = `${process.env.APP_URL || 'http://localhost:5173'}/accept-invite?token=${token}`;
      logger.info('Invitation created', { email: body.email, tenant: req.tenantId, url: inviteUrl });

      res.status(201).json({
        data: { email: body.email, tier: body.tier, invite_url: inviteUrl },
        message: 'Invitation created. Share the invite URL with the user.',
      });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * POST /api/v1/auth/accept-invite
 * Accept an invitation and create account (public)
 */
tenantRouter.post('/auth/accept-invite', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      token:        z.string().min(1),
      display_name: z.string().min(1),
      password:     z.string().min(8),
    });
    const body = schema.parse(req.body);

    const invites = await sql`
      SELECT i.*, t.slug AS tenant_slug, t.name AS tenant_name, t.is_active AS tenant_active
      FROM tenant_invitations i
      JOIN tenants t ON t.id = i.tenant_id
      WHERE i.token = ${body.token}
        AND i.accepted_at IS NULL
        AND i.expires_at > NOW()
    `;

    if (!invites.length) {
      return res.status(400).json({ error: 'Invalid or expired invitation token' });
    }

    const invite = invites[0];
    if (!invite.tenant_active) {
      return res.status(403).json({ error: 'This organisation account is inactive' });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const [user] = await sql`
      INSERT INTO users (email, display_name, tier, roles, password_hash, tenant_id, is_tenant_admin, is_active)
      VALUES (${invite.email}, ${body.display_name}, ${invite.tier}, ARRAY[${invite.tier}]::text[],
              ${passwordHash}, ${invite.tenant_id}, FALSE, TRUE)
      RETURNING id, email, display_name, tier, tenant_id
    `;

    await sql`UPDATE tenant_invitations SET accepted_at = NOW() WHERE id = ${invite.id}`;

    const token = issueToken({
      id: user.id, email: user.email, displayName: user.display_name,
      tier: user.tier as RestoreTier, roles: [user.tier],
      tenant_id: user.tenant_id, tenant_slug: invite.tenant_slug,
      is_tenant_admin: false,
    });

    res.status(201).json({
      data: {
        token,
        tenant: { id: invite.tenant_id, slug: invite.tenant_slug, name: invite.tenant_name },
        user: { id: user.id, email: user.email, displayName: user.display_name, tier: user.tier },
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── TENANT SETTINGS ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/tenant
 * Get current tenant details
 */
tenantRouter.get('/tenant', requireAuth, requireTenant, async (req: Request, res: Response) => {
  try {
    const [tenant] = await sql`
      SELECT id, slug, name, plan, is_active, max_users, max_assets, settings, created_at
      FROM tenants WHERE id = ${req.tenantId}
    `;
    const [{ user_count }] = await sql`SELECT COUNT(*)::int AS user_count FROM users WHERE tenant_id = ${req.tenantId}`;
    const [{ asset_count }] = await sql`SELECT COUNT(*)::int AS asset_count FROM assets WHERE tenant_id = ${req.tenantId}`;

    res.json({ data: { ...tenant, user_count, asset_count } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/v1/tenant
 * Update tenant name and settings (tenant admin only)
 */
tenantRouter.patch('/tenant', requireAuth, requireTenant, requireTenantAdmin, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      name:     z.string().min(2).optional(),
      settings: z.record(z.unknown()).optional(),
    });
    const body = schema.parse(req.body);
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (body.name)     updates.name = body.name;
    if (body.settings) updates.settings = body.settings;

    const [updated] = await sql`UPDATE tenants SET ${sql(updates)} WHERE id = ${req.tenantId} RETURNING id, slug, name, plan, settings`;
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── SUPER-ADMIN: PLATFORM OVERVIEW ──────────────────────────────────────────

/**
 * GET /api/v1/admin/tenants
 * List all tenants (super-admin only)
 */
tenantRouter.get('/admin/tenants', requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const tenants = await sql`
      SELECT t.id, t.slug, t.name, t.plan, t.is_active, t.created_at,
             COUNT(DISTINCT u.id)::int AS user_count,
             COUNT(DISTINCT a.id)::int AS asset_count
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id = t.id
      LEFT JOIN assets a ON a.tenant_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `;
    res.json({ data: tenants });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/v1/admin/tenants/:id
 * Activate/deactivate a tenant or change plan (super-admin only)
 */
tenantRouter.patch('/admin/tenants/:id', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      is_active:  z.boolean().optional(),
      plan:       z.enum(['starter','professional','enterprise']).optional(),
      max_users:  z.number().int().min(1).optional(),
      max_assets: z.number().int().min(1).optional(),
    });
    const body = schema.parse(req.body);
    const updates: Record<string, unknown> = { updated_at: new Date() };
    Object.assign(updates, body);
    const [updated] = await sql`UPDATE tenants SET ${sql(updates)} WHERE id = ${req.params.id} RETURNING *`;
    res.json({ data: updated });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
