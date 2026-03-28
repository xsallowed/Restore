import { sql } from '../../lib/db';
import { logger } from '../../lib/logger';

interface OperationalReport {
  type: 'OPERATIONAL';
  eventId: string;
  generatedAt: Date;
  event: Record<string, unknown>;
  soe: Record<string, unknown>;
  steps: Record<string, unknown>[];
  evidence: Record<string, unknown>[];
  escalations: Record<string, unknown>[];
  timeline: Array<{ timestamp: Date; action: string; user: string; detail: string }>;
  deviations: Array<{ stepName: string; expectedStatus: string; actualStatus: string; reason: string }>;
  lessonsLearned: Record<string, unknown>[];
  participants: string[];
  summary: {
    totalSteps: number;
    completedSteps: number;
    skippedSteps: number;
    blockedSteps: number;
    completionPct: number;
    totalDurationMinutes: number;
    mttrMinutes: number | null;
  };
}

interface ExecutiveReport {
  type: 'EXECUTIVE';
  eventId: string;
  generatedAt: Date;
  eventTitle: string;
  eventType: string;
  severity: string;
  openedAt: Date;
  resolvedAt: Date | null;
  affectedServices: Array<{ name: string; status: string; restoredAt: Date | null }>;
  businessImpactSummary: string;
  recoveryTimelineMinutes: number | null;
  rtoTarget: number | null;
  rtoMet: boolean | null;
  teamSummary: Array<{ team: string; stepsComplete: number; stepsTotal: number }>;
  keyActions: string[];
  regulatoryNotes: string;
  confidenceScore: number | null;
}

export async function generateOperationalReport(eventId: string): Promise<OperationalReport> {
  logger.info('Generating operational report', { eventId });

  const [event] = await sql<Record<string, unknown>[]>`
    SELECT e.*, u.display_name as commander_name
    FROM recovery_events e
    LEFT JOIN users u ON u.id = e.commander_id
    WHERE e.id = ${eventId}
  `;
  if (!event) throw new Error('Event not found');

  const [soe] = await sql<Record<string, unknown>[]>`SELECT * FROM soes WHERE event_id = ${eventId} ORDER BY created_at DESC LIMIT 1`;

  const steps = soe ? await sql<Record<string, unknown>[]>`
    SELECT s.*, u.display_name as assignee_name, p.name as phase_name
    FROM soe_steps s
    LEFT JOIN users u ON u.id = s.assigned_to
    LEFT JOIN soe_phases p ON p.id = s.phase_id
    WHERE s.soe_id = ${soe.id}
    ORDER BY s.sequence
  ` : [];

  const evidence = await sql<Record<string, unknown>[]>`
    SELECT ev.*, u.display_name as uploaded_by_name, s.name as step_name
    FROM evidence ev
    JOIN users u ON u.id = ev.uploaded_by
    LEFT JOIN soe_steps s ON s.id = ev.step_id
    WHERE ev.event_id = ${eventId}
    ORDER BY ev.created_at
  `;

  const escalations = await sql<Record<string, unknown>[]>`
    SELECT esc.*, u.display_name as raised_by_name
    FROM escalations esc
    JOIN users u ON u.id = esc.raised_by
    WHERE esc.event_id = ${eventId}
    ORDER BY esc.created_at
  `;

  const auditEntries = await sql<{ created_at: Date; action: string; user_name: string; object_type: string; object_id: string }[]>`
    SELECT a.created_at, a.action, u.display_name as user_name, a.object_type, a.object_id::text
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id::uuid
    WHERE a.event_id = ${eventId}
    ORDER BY a.created_at
  `;

  const lessonsLearned = await sql<Record<string, unknown>[]>`
    SELECT ll.*, u.display_name as submitted_by_name
    FROM lessons_learned ll
    JOIN users u ON u.id = ll.submitted_by
    WHERE ll.event_id = ${eventId}
  `;

  const participants = [...new Set(steps
    .map(s => s.assignee_name as string)
    .filter(Boolean))];

  const completedSteps = steps.filter(s => s.status === 'COMPLETED').length;
  const skippedSteps  = steps.filter(s => s.status === 'SKIPPED').length;
  const blockedSteps  = steps.filter(s => s.status === 'BLOCKED').length;

  const openedAt   = new Date(event.opened_at as string);
  const resolvedAt = event.resolved_at ? new Date(event.resolved_at as string) : null;
  const mttrMinutes = resolvedAt
    ? Math.round((resolvedAt.getTime() - openedAt.getTime()) / 60000)
    : null;

  const deviations = steps
    .filter(s => s.status === 'SKIPPED' || s.status === 'BLOCKED')
    .map(s => ({
      stepName: s.name as string,
      expectedStatus: 'COMPLETED',
      actualStatus: s.status as string,
      reason: (s.skipped_reason || s.blocked_reason || 'No reason provided') as string,
    }));

  const timeline = auditEntries.map(a => ({
    timestamp: new Date(a.created_at),
    action: a.action,
    user: a.user_name || 'System',
    detail: `${a.object_type || ''} ${a.object_id?.slice(0, 8) || ''}`.trim(),
  }));

  return {
    type: 'OPERATIONAL',
    eventId,
    generatedAt: new Date(),
    event,
    soe: soe || {},
    steps,
    evidence,
    escalations,
    timeline,
    deviations,
    lessonsLearned,
    participants,
    summary: {
      totalSteps: steps.length,
      completedSteps,
      skippedSteps,
      blockedSteps,
      completionPct: steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0,
      totalDurationMinutes: mttrMinutes || 0,
      mttrMinutes,
    },
  };
}

export async function generateExecutiveReport(eventId: string): Promise<ExecutiveReport> {
  logger.info('Generating executive report', { eventId });

  const [event] = await sql<Record<string, unknown>[]>`SELECT * FROM recovery_events WHERE id = ${eventId}`;
  if (!event) throw new Error('Event not found');

  const affectedServiceIds = (event.affected_service_ids as string[]) || [];
  const services = affectedServiceIds.length > 0
    ? await sql<{ name: string; status: string; rto_minutes: number; status_updated_at: Date }[]>`
        SELECT name, status, rto_minutes, status_updated_at FROM business_services
        WHERE id = ANY(${affectedServiceIds})`
    : [];

  const [soe] = await sql<{ recovery_confidence_score: number; ml_ttfr_minutes: number }[]>`
    SELECT recovery_confidence_score, ml_ttfr_minutes FROM soes
    WHERE event_id = ${eventId} ORDER BY created_at DESC LIMIT 1`;

  const steps = soe ? await sql<{ swim_lane: string; status: string }[]>`
    SELECT swim_lane, status FROM soe_steps
    WHERE soe_id = (SELECT id FROM soes WHERE event_id = ${eventId} ORDER BY created_at DESC LIMIT 1)
  ` : [];

  // Team summary by swim lane
  const laneMap: Record<string, { total: number; complete: number }> = {};
  for (const step of steps) {
    const lane = step.swim_lane || 'General';
    if (!laneMap[lane]) laneMap[lane] = { total: 0, complete: 0 };
    laneMap[lane].total++;
    if (step.status === 'COMPLETED') laneMap[lane].complete++;
  }
  const teamSummary = Object.entries(laneMap).map(([team, counts]) => ({
    team,
    stepsComplete: counts.complete,
    stepsTotal: counts.total,
  }));

  const openedAt   = new Date(event.opened_at as string);
  const resolvedAt = event.resolved_at ? new Date(event.resolved_at as string) : null;
  const mttr = resolvedAt ? Math.round((resolvedAt.getTime() - openedAt.getTime()) / 60000) : null;
  const rtoTarget = services.length > 0 ? Math.min(...services.map(s => s.rto_minutes)) : null;
  const rtoMet = mttr !== null && rtoTarget !== null ? mttr <= rtoTarget : null;

  const impactLevel = services.length === 0 ? 'limited' : services.length === 1 ? 'single-service' : 'multi-service';
  const businessImpactSummary = services.length > 0
    ? `${services.length} business service${services.length > 1 ? 's were' : ' was'} impacted: ${services.map(s => s.name).join(', ')}. This represents a ${impactLevel} disruption.`
    : 'Business service impact is being assessed.';

  const keyActions = [
    `Recovery event opened at ${openedAt.toLocaleString()}`,
    `${steps.filter(s => s.status === 'COMPLETED').length} of ${steps.length} recovery steps completed`,
    resolvedAt ? `Event resolved at ${resolvedAt.toLocaleString()}` : 'Recovery ongoing',
    rtoMet !== null ? (rtoMet ? `RTO target (${rtoTarget} min) was met` : `RTO target (${rtoTarget} min) was exceeded`) : '',
  ].filter(Boolean);

  return {
    type: 'EXECUTIVE',
    eventId,
    generatedAt: new Date(),
    eventTitle: event.title as string,
    eventType: event.event_type as string,
    severity: event.severity as string,
    openedAt,
    resolvedAt,
    affectedServices: services.map(s => ({
      name: s.name,
      status: s.status,
      restoredAt: s.status === 'RESTORED' ? s.status_updated_at : null,
    })),
    businessImpactSummary,
    recoveryTimelineMinutes: mttr,
    rtoTarget,
    rtoMet,
    teamSummary,
    keyActions,
    regulatoryNotes: 'This report should be retained for a minimum of 7 years per regulatory requirements. Review with Compliance and Legal before external disclosure.',
    confidenceScore: soe?.recovery_confidence_score ? Math.round(soe.recovery_confidence_score * 100) : null,
  };
}

export async function generateRehearsalAssessmentReport(rehearsalId: string): Promise<Record<string, unknown>> {
  const [rehearsal] = await sql<Record<string, unknown>[]>`SELECT * FROM rehearsals WHERE id = ${rehearsalId}`;
  if (!rehearsal || !rehearsal.recovery_event_id) throw new Error('Rehearsal event not found');

  const operational = await generateOperationalReport(rehearsal.recovery_event_id as string);

  const participants = await sql<{ display_name: string }[]>`
    SELECT u.display_name FROM rehearsal_participants rp
    JOIN users u ON u.id = rp.user_id
    WHERE rp.rehearsal_id = ${rehearsalId}
  `;

  const mlFlags = await sql<{ name: string; ml_missing_step_confidence: number }[]>`
    SELECT s.name, s.ml_missing_step_confidence
    FROM soe_steps s
    JOIN soes soe ON soe.id = s.soe_id
    WHERE soe.event_id = ${rehearsal.recovery_event_id as string}
      AND s.ml_missing_step_flag = TRUE
  `;

  return {
    type: 'REHEARSAL_ASSESSMENT',
    rehearsalId,
    name: rehearsal.name,
    eventType: rehearsal.event_type,
    generatedAt: new Date(),
    participants: participants.map(p => p.display_name),
    completionMetrics: operational.summary,
    mlDetectedMissingSteps: mlFlags,
    criticalPathPerformance: {
      completionPct: operational.summary.completionPct,
      totalDurationMinutes: operational.summary.totalDurationMinutes,
    },
    escalationsRaised: operational.escalations.length,
    lessonsLearned: operational.lessonsLearned,
    deviations: operational.deviations,
    recommendations: mlFlags.length > 0
      ? [`${mlFlags.length} steps were flagged as potentially missing — review runbook coverage for this event type.`]
      : ['Runbook coverage appears complete for this event type.'],
  };
}
