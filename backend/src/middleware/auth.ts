import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type RestoreTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'AUTHOR' | 'ADMIN';

export interface RestoreJwtPayload {
  sub: string;
  email: string;
  displayName: string;
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
      isRehearsal?: boolean;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'];

  // Machine-to-machine: SOAR callback
  if (apiKey) {
    if (apiKey !== process.env.AUTOMATION_API_KEY) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    req.user = {
      sub: 'automation',
      email: 'automation@restore.internal',
      displayName: 'Automation',
      restore_tier: 'ADMIN',
      restore_roles: ['AUTOMATION'],
      restore_permissions: ['step:complete', 'automation:callback'],
      iat: Date.now(),
      exp: Date.now() + 3600,
    };
    return next();
  }

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as RestoreJwtPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Tier hierarchy: higher index = more access
const TIER_HIERARCHY: RestoreTier[] = ['BRONZE', 'SILVER', 'GOLD', 'AUTHOR', 'ADMIN'];

export function requireTier(...tiers: RestoreTier[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    const userTier = req.user.restore_tier;
    // ADMIN can do everything
    if (userTier === 'ADMIN') return next();
    if (tiers.includes(userTier)) return next();
    return res.status(403).json({
      error: 'Insufficient tier',
      required: tiers,
      current: userTier,
    });
  };
}

export function requireMinTier(minTier: RestoreTier) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    const userIdx = TIER_HIERARCHY.indexOf(req.user.restore_tier);
    const minIdx = TIER_HIERARCHY.indexOf(minTier);
    if (req.user.restore_tier === 'ADMIN' || userIdx >= minIdx) return next();
    return res.status(403).json({ error: 'Insufficient tier', required: minTier, current: req.user.restore_tier });
  };
}

export function issueToken(user: {
  id: string;
  email: string;
  displayName: string;
  tier: RestoreTier;
  roles: string[];
}): string {
  const permissions = buildPermissions(user.tier);
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      restore_tier: user.tier,
      restore_roles: user.roles,
      restore_permissions: permissions,
    } as Omit<RestoreJwtPayload, 'iat' | 'exp'>,
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function buildPermissions(tier: RestoreTier): string[] {
  const bronze = ['soe:read', 'step:complete', 'step:skip', 'evidence:write', 'escalation:create', 'runbook:view', 'rehearsal:participate'];
  const silver = [...bronze, 'soe:generate', 'soe:edit', 'step:assign', 'step:override', 'gantt:view', 'gantt:export', 'event:open', 'event:close', 'automation:approve'];
  const gold = ['executive-dashboard:read', 'business-service:read', 'mttr:read', 'report:export-executive'];
  const author = [...silver, 'runbook:write', 'connector:manage', 'template:write', 'lessons-learned:review'];
  const admin = ['*'];

  switch (tier) {
    case 'BRONZE': return bronze;
    case 'SILVER': return silver;
    case 'GOLD': return gold;
    case 'AUTHOR': return author;
    case 'ADMIN': return admin;
  }
}
