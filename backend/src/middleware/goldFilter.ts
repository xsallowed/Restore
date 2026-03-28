import { Request, Response, NextFunction } from 'express';

/**
 * Gold Tier Data Abstraction Filter
 * Enforced server-side — not a UI layer control.
 * All responses to GOLD-tier JWTs pass through this filter.
 * Step-level, user-level, and operational detail is stripped
 * and replaced with business-service aggregates.
 */
export function goldDataFilter(req: Request, res: Response, next: NextFunction) {
  if (req.user?.restore_tier !== 'GOLD') return next();

  // Intercept res.json to filter all outgoing JSON
  const originalJson = res.json.bind(res);
  res.json = function (data: unknown) {
    return originalJson(filterForGold(data));
  };
  next();
}

function filterForGold(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) return data.map(filterForGold);
  if (typeof data !== 'object') return data;

  const obj = data as Record<string, unknown>;

  // Strip step-level SOE data
  if ('steps' in obj) {
    const { steps: _, ...rest } = obj;
    return filterForGold({
      ...rest,
      _goldFiltered: true,
      _message: 'Step-level data not available at Gold tier',
    });
  }

  // Strip user identities — replace with role-level counts
  if ('assignedTo' in obj) {
    const { assignedTo: _, ...rest } = obj;
    return filterForGold(rest);
  }

  // Strip evidence
  if ('evidence' in obj) {
    const { evidence: _, ...rest } = obj;
    return filterForGold(rest);
  }

  // Strip runbook content and citations
  if ('runbookCitation' in obj || 'contentText' in obj) {
    const { runbookCitation: _, contentText: __, ...rest } = obj;
    return filterForGold(rest);
  }

  // Strip individual asset details (hostnames, IPs)
  if ('ipAddress' in obj || 'hostname' in obj) {
    const { ipAddress: _, hostname: __, ...rest } = obj;
    return filterForGold(rest);
  }

  // Recurse into nested objects
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    filtered[key] = filterForGold(value);
  }
  return filtered;
}

export function aggregateForGold(steps: Array<{
  status: string;
  swimLane?: string;
  estimatedDurationMinutes?: number;
  mlPredictedDurationMinutes?: number;
}>) {
  const total = steps.length;
  const completed = steps.filter(s => s.status === 'COMPLETED').length;
  const blocked = steps.filter(s => s.status === 'BLOCKED').length;
  const inProgress = steps.filter(s => s.status === 'IN_PROGRESS').length;

  const byLane: Record<string, { total: number; completed: number }> = {};
  for (const step of steps) {
    const lane = step.swimLane ?? 'General';
    if (!byLane[lane]) byLane[lane] = { total: 0, completed: 0 };
    byLane[lane].total++;
    if (step.status === 'COMPLETED') byLane[lane].completed++;
  }

  return {
    totalSteps: total,
    completedSteps: completed,
    blockedSteps: blocked,
    inProgressSteps: inProgress,
    completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    byTeam: Object.entries(byLane).map(([team, counts]) => ({
      team,
      summary: `${counts.completed} of ${counts.total} steps complete`,
    })),
  };
}
