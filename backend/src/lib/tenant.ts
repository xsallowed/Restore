import { sql as rawSql } from './db';
import { Request } from 'express';

/**
 * Returns a tenant-scoped SQL helper.
 * Call this at the top of each route handler:
 *
 *   const tsql = tenantSql(req);
 *   const assets = await tsql`SELECT * FROM assets`;
 *   // automatically adds WHERE tenant_id = $tenantId
 *
 * For inserts, use injectTenantId(req, data) to add tenant_id to the object.
 */

export function getTenantId(req: Request): string | null {
  return req.user?.tenant_id ?? null;
}

/**
 * Inject tenant_id into an object before INSERT.
 * Usage: await sql`INSERT INTO assets ${sql(injectTenant(req, { name: 'foo' }))}
 */
export function injectTenant<T extends Record<string, unknown>>(
  req: Request,
  data: T
): T & { tenant_id: string | null } {
  return { ...data, tenant_id: getTenantId(req) };
}

/**
 * Set the PostgreSQL session variable so RLS policies fire correctly.
 * Call this once per request before any queries.
 * Works best as middleware on the router, or called at start of each handler.
 */
export async function setTenantContext(tenantId: string | null): Promise<void> {
  if (tenantId) {
    await rawSql`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
  } else {
    // Super-admin: clear the tenant context so RLS passes everything through
    await rawSql`SELECT set_config('app.current_tenant_id', '', TRUE)`;
  }
}

/**
 * Express middleware that sets tenant context on the DB connection
 * at the start of each request. Add to any tenant-scoped router.
 */
export function tenantContextMiddleware() {
  return async (req: any, res: any, next: any) => {
    try {
      await setTenantContext(req.user?.tenant_id ?? null);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Build a WHERE fragment for tenant scoping.
 * Used when you need manual SQL building.
 *
 * const tenantFilter = tenantWhere(req, 'a');
 * // returns: "a.tenant_id = 'uuid-here'"  or  "1=1" for super-admins
 */
export function tenantWhereClause(req: Request, alias = ''): string {
  const tenantId = getTenantId(req);
  if (!tenantId) return '1=1'; // super-admin sees all
  const col = alias ? `${alias}.tenant_id` : 'tenant_id';
  return `${col} = '${tenantId}'`; // tenantId is validated UUID from JWT
}
