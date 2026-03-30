import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type RestoreTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'AUTHOR' | 'ADMIN';

export interface RestoreJwtPayload {
  sub: string;                 // user UUID
  email: string;
  displayName: string;
  tenant_id: string | null;    // null = super-admin (platform staff)
  tenant_slug: string | null;
  is_tenant_admin: boolean;
  restore_tier: RestoreTier;
  restore_roles: string[];
  restore_permissions: string[];
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: RestoreJwtPayload;
      tenantId?: string;        // convenience shortcut
      isRehearsal?: boolean;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production';

// ─── Core auth middleware ─────────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKey     = req.headers['x-api-key'] as string | undefined;

  // Machine-to-machine: per-tenant automation key stored in env or DB
  if (apiKey) {
    // Support both global automation key (legacy) and per-tenant keys
    const globalKey = process.env.AUTOMATION_API_KEY;
    if (globalKey && apiKey === globalKey) {
      req.user = {
        sub: 'automation',
        email: 'automation@restore.internal',
        displayName: 'Automation',
        tenant_id: null,
        tenant_slug: null,
        is_tenant_admin: false,
        restore_tier: 'ADMIN',
        restore_roles: ['AUTOMATION'],
        restore_permissions: ['*'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      return next();
    }
    return res.status(401).json({ error: 'Invalid API key' });
  }

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as RestoreJwtPayload;
    req.user = payload;
    req.tenantId = payload.tenant_id ?? undefined;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Tenant isolation middleware ──────────────────────────────────────────────
// Must be placed AFTER requireAuth on any tenant-scoped route.
// Sets the PostgreSQL session variable so RLS policies fire correctly.

export function requireTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });

  // Super-admins (tenant_id = null) bypass tenant isolation
  if (req.user.tenant_id === null && req.user.restore_tier === 'ADMIN') {
    return next();
  }

  if (!req.user.tenant_id) {
    return res.status(403).json({ error: 'User has no tenant assigned' });
  }

  req.tenantId = req.user.tenant_id;
  next();
}

// ─── Tier hierarchy ───────────────────────────────────────────────────────────

const TIER_HIERARCHY: RestoreTier[] = ['BRONZE', 'SILVER', 'GOLD', 'AUTHOR', 'ADMIN'];

export function requireTier(...tiers: RestoreTier[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (req.user.restore_tier === 'ADMIN') return next();
    if (tiers.includes(req.user.restore_tier)) return next();
    return res.status(403).json({ error: 'Insufficient tier', required: tiers, current: req.user.restore_tier });
  };
}

export function requireMinTier(minTier: RestoreTier) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (req.user.restore_tier === 'ADMIN') return next();
    const userIdx = TIER_HIERARCHY.indexOf(req.user.restore_tier);
    const minIdx  = TIER_HIERARCHY.indexOf(minTier);
    if (userIdx >= minIdx) return next();
    return res.status(403).json({ error: 'Insufficient tier', required: minTier, current: req.user.restore_tier });
  };
}

// Only the tenant's own admin can perform admin actions within a tenant
export function requireTenantAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  if (req.user.restore_tier === 'ADMIN') return next();     // super-admin always passes
  if (req.user.is_tenant_admin) return next();
  return res.status(403).json({ error: 'Tenant admin access required' });
}

// Super-admin only (platform staff) — cannot be reached by tenant users
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  if (req.user.restore_tier === 'ADMIN' && req.user.tenant_id === null) return next();
  return res.status(403).json({ error: 'Super-admin access required' });
}

// ─── Token issuance ───────────────────────────────────────────────────────────

export function issueToken(user: {
  id: string;
  email: string;
  displayName: string;
  tier: RestoreTier;
  roles: string[];
  tenant_id: string | null;
  tenant_slug: string | null;
  is_tenant_admin: boolean;
}): string {
  const permissions = buildPermissions(user.tier);
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      tenant_id: user.tenant_id,
      tenant_slug: user.tenant_slug,
      is_tenant_admin: user.is_tenant_admin,
      restore_tier: user.tier,
      restore_roles: user.roles,
      restore_permissions: permissions,
    } as Omit<RestoreJwtPayload, 'iat' | 'exp'>,
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function buildPermissions(tier: RestoreTier): string[] {
  const bronze  = ['soe:read','step:complete','step:skip','evidence:write','escalation:create','runbook:view','rehearsal:participate'];
  const silver  = [...bronze,'soe:generate','soe:edit','step:assign','step:override','gantt:view','gantt:export','event:open','event:close','automation:approve'];
  const gold    = ['executive-dashboard:read','business-service:read','mttr:read','report:export-executive'];
  const author  = [...silver,'runbook:write','connector:manage','template:write','lessons-learned:review'];
  const admin   = ['*'];
  switch (tier) {
    case 'BRONZE': return bronze;
    case 'SILVER': return silver;
    case 'GOLD':   return gold;
    case 'AUTHOR': return author;
    case 'ADMIN':  return admin;
  }
}
