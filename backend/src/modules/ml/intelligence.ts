/**
 * FR5 — Predictive Intelligence Engine
 * Lean MVP implementation using statistical models (no external ML platform).
 * Models run in-process inside the worker. Upgradeable to dedicated ML service later.
 */

import { sql } from '../../lib/db';
import { logger } from '../../lib/logger';

// ─── Duration Prediction (FR5.2) ─────────────────────────────────────────────
// Uses historical execution data grouped by event_type + step_name similarity.
// Falls back to runbook estimate when insufficient history exists.

export async function predictStepDuration(params: {
  stepName: string;
  eventType: string;
  severity: string;
  swimLane: string;
  estimatedDurationMinutes: number;
}): Promise<{ predictedMinutes: number; confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW'; sampleSize: number }> {
  const { stepName, eventType, estimatedDurationMinutes } = params;

  // Look for historical completions with similar step names and event types
  const history = await sql<{ actual_minutes: number }[]>`
    SELECT
      EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) / 60 AS actual_minutes
    FROM soe_steps s
    JOIN soes soe ON soe.id = s.soe_id
    JOIN recovery_events e ON e.id = soe.event_id
    WHERE s.status = 'COMPLETED'
      AND s.started_at IS NOT NULL
      AND s.completed_at IS NOT NULL
      AND e.event_type = ${eventType}
      AND e.is_rehearsal = FALSE
      AND LOWER(s.name) SIMILAR TO LOWER(${`%${stepName.split(' ').slice(0, 3).join('%')}%`})
      AND EXTRACT(EPOCH FROM (s.completed_at - s.started_at)) / 60 BETWEEN 1 AND 480
    ORDER BY s.completed_at DESC
    LIMIT 20
  `;

  if (history.length < 3) {
    // Insufficient data — apply a simple heuristic adjustment based on severity
    const severityMultiplier: Record<string, number> = { P1: 0.85, P2: 1.0, P3: 1.15, P4: 1.3 };
    const multiplier = severityMultiplier[params.severity] ?? 1.0;
    return {
      predictedMinutes: Math.round(estimatedDurationMinutes * multiplier),
      confidenceLevel: 'LOW',
      sampleSize: history.length,
    };
  }

  const durations = history.map(h => h.actual_minutes).sort((a, b) => a - b);

  // Trim outliers (remove top and bottom 10%)
  const trimCount = Math.max(1, Math.floor(durations.length * 0.1));
  const trimmed = durations.slice(trimCount, durations.length - trimCount);

  const mean = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
  const variance = trimmed.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / trimmed.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // coefficient of variation

  const confidenceLevel = history.length >= 10 && cv < 0.3 ? 'HIGH'
    : history.length >= 5 && cv < 0.5 ? 'MEDIUM' : 'LOW';

  return {
    predictedMinutes: Math.round(mean),
    confidenceLevel,
    sampleSize: history.length,
  };
}

// ─── TTFR Confidence Intervals (FR5.3) ───────────────────────────────────────

export async function calculateTTFRConfidence(soeId: string): Promise<{
  pointEstimateMinutes: number;
  p10Minutes: number;  // optimistic
  p90Minutes: number;  // pessimistic
  criticalPathComplete: number;
  remainingCriticalSteps: number;
}> {
  const steps = await sql<{
    id: string;
    status: string;
    is_on_critical_path: boolean;
    ml_predicted_duration_minutes: number;
    estimated_duration_minutes: number;
    started_at: Date;
    completed_at: Date;
  }[]>`
    SELECT id, status, is_on_critical_path,
           ml_predicted_duration_minutes, estimated_duration_minutes,
           started_at, completed_at
    FROM soe_steps WHERE soe_id = ${soeId}
  `;

  const criticalSteps = steps.filter(s => s.is_on_critical_path);
  const completedCritical = criticalSteps.filter(s => s.status === 'COMPLETED');
  const remainingCritical = criticalSteps.filter(s => !['COMPLETED', 'SKIPPED'].includes(s.status));

  // Calculate actual variance from completed steps
  const completedWithTimes = steps.filter(s =>
    s.status === 'COMPLETED' && s.started_at && s.completed_at
  );

  let varianceFactor = 0.2; // default 20% variance
  if (completedWithTimes.length >= 3) {
    const ratios = completedWithTimes.map(s => {
      const actual = (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 60000;
      const predicted = s.ml_predicted_duration_minutes || s.estimated_duration_minutes || 15;
      return actual / predicted;
    });
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const ratioVariance = ratios.reduce((s, v) => s + Math.pow(v - avgRatio, 2), 0) / ratios.length;
    varianceFactor = Math.min(0.5, Math.sqrt(ratioVariance));
  }

  const pointEstimate = remainingCritical.reduce((sum, s) => {
    return sum + (s.ml_predicted_duration_minutes || s.estimated_duration_minutes || 15);
  }, 0);

  // Add variance for in-progress steps (already started so less uncertain)
  const inProgressFactor = steps.filter(s => s.status === 'IN_PROGRESS').length > 0 ? 0.8 : 1.0;

  return {
    pointEstimateMinutes: Math.round(pointEstimate),
    p10Minutes: Math.round(pointEstimate * (1 - varianceFactor) * inProgressFactor),
    p90Minutes: Math.round(pointEstimate * (1 + varianceFactor * 1.5)),
    criticalPathComplete: criticalSteps.length > 0
      ? Math.round((completedCritical.length / criticalSteps.length) * 100) : 100,
    remainingCriticalSteps: remainingCritical.length,
  };
}

// ─── Recovery Confidence Score (FR5.4) ───────────────────────────────────────

export async function calculateRecoveryConfidence(params: {
  soeId: string;
  eventId: string;
  rtoMinutes?: number;
}): Promise<{ score: number; factors: Record<string, number>; interpretation: string }> {
  const steps = await sql<{ status: string; is_on_critical_path: boolean; ml_missing_step_flag: boolean }[]>`
    SELECT status, is_on_critical_path, ml_missing_step_flag
    FROM soe_steps WHERE soe_id = ${params.soeId}
  `;

  const total = steps.length || 1;
  const completed = steps.filter(s => s.status === 'COMPLETED').length;
  const blocked = steps.filter(s => s.status === 'BLOCKED').length;
  const missing = steps.filter(s => s.ml_missing_step_flag).length;
  const criticalBlocked = steps.filter(s => s.is_on_critical_path && s.status === 'BLOCKED').length;

  const completionFactor   = completed / total;                                // 0–1
  const blockagePenalty    = Math.min(0.5, (blocked / total) * 1.5);          // 0–0.5
  const criticalPenalty    = Math.min(0.3, criticalBlocked * 0.15);           // 0–0.3
  const missingStepPenalty = Math.min(0.2, (missing / total) * 0.4);         // 0–0.2

  const ttfr = await calculateTTFRConfidence(params.soeId);
  const rtoFactor = params.rtoMinutes
    ? Math.max(0, Math.min(0.2, (params.rtoMinutes - ttfr.pointEstimateMinutes) / params.rtoMinutes * 0.2))
    : 0.1;

  const raw = Math.max(0.05, Math.min(1,
    completionFactor * 0.5
    + rtoFactor
    - blockagePenalty
    - criticalPenalty
    - missingStepPenalty
    + 0.2  // base confidence
  ));

  const score = Math.round(raw * 100);
  const interpretation = score >= 75 ? 'On track to meet RTO'
    : score >= 50 ? 'At risk — monitor closely'
    : score >= 25 ? 'Unlikely to meet RTO without intervention'
    : 'Recovery severely delayed — escalate immediately';

  return {
    score,
    factors: {
      completionPct: Math.round(completionFactor * 100),
      blockedSteps: blocked,
      criticalBlockedSteps: criticalBlocked,
      missingStepFlags: missing,
      estimatedTTFRMinutes: ttfr.pointEstimateMinutes,
    },
    interpretation,
  };
}

// ─── Missing Step Detection (FR5.1) ──────────────────────────────────────────
// Pattern-based detector: given event type + completed steps, flags
// steps that are typically executed together but appear absent.

const REQUIRED_STEP_PATTERNS: Record<string, string[][]> = {
  RANSOMWARE: [
    ['isolat', 'network'],
    ['notif', 'stakeholder'],
    ['backup', 'restore'],
    ['patch', 'update'],
    ['forensic', 'evidence'],
    ['report', 'incident'],
  ],
  DATA_EXFILTRATION: [
    ['identify', 'data'],
    ['revoke', 'access'],
    ['notif', 'regulator'],
    ['assess', 'impact'],
  ],
  INFRASTRUCTURE_FAILURE: [
    ['failover', 'switch'],
    ['verify', 'check', 'test'],
    ['restore', 'recover'],
    ['monitor', 'watch'],
  ],
  DR_ACTIVATION: [
    ['activate', 'dr'],
    ['notify', 'stakeholder'],
    ['verify', 'system'],
    ['communicate', 'status'],
  ],
};

export async function detectMissingSteps(soeId: string, eventType: string): Promise<string[]> {
  const steps = await sql<{ id: string; name: string; status: string }[]>`
    SELECT id, name, status FROM soe_steps WHERE soe_id = ${soeId}
  `;

  const patterns = REQUIRED_STEP_PATTERNS[eventType.toUpperCase()] || [];
  const missingStepIds: string[] = [];
  const allStepNames = steps.map(s => s.name.toLowerCase());

  for (const patternGroup of patterns) {
    // Check if any step in the SOE matches this pattern
    const matchExists = allStepNames.some(name =>
      patternGroup.some(keyword => name.includes(keyword))
    );

    if (!matchExists) {
      // Pattern is completely absent — flag the first NOT_STARTED step as potentially relevant
      const candidate = steps.find(s => s.status === 'NOT_STARTED');
      if (candidate && !missingStepIds.includes(candidate.id)) {
        missingStepIds.push(candidate.id);
      }
    }
  }

  return missingStepIds;
}

// ─── Impact Severity Predictor (FR5.5) ───────────────────────────────────────

export async function predictImpactSeverity(params: {
  eventType: string;
  affectedServiceCount: number;
  affectedServiceTiers: number[];  // criticality tiers of affected services
  blastRadiusAssetCount: number;
}): Promise<{ recommendedSeverity: 'P1' | 'P2' | 'P3' | 'P4'; confidence: number; reasoning: string }> {
  const { eventType, affectedServiceCount, affectedServiceTiers, blastRadiusAssetCount } = params;

  // High-risk event types default to P1/P2
  const criticalEventTypes = ['RANSOMWARE', 'DATA_EXFILTRATION', 'DR_ACTIVATION', 'SUPPLY_CHAIN_COMPROMISE'];
  const highEventTypes = ['DDoS', 'INSIDER_THREAT', 'CLOUD_REGION_FAILURE'];

  const hasTier1Service = affectedServiceTiers.includes(1);
  const hasTier2Service = affectedServiceTiers.includes(2);
  const isCriticalType = criticalEventTypes.includes(eventType.toUpperCase());
  const isHighType = highEventTypes.includes(eventType.toUpperCase());

  let score = 0;
  if (isCriticalType) score += 40;
  else if (isHighType) score += 25;
  else score += 10;

  if (hasTier1Service) score += 35;
  else if (hasTier2Service) score += 20;

  if (affectedServiceCount >= 5) score += 15;
  else if (affectedServiceCount >= 3) score += 10;
  else if (affectedServiceCount >= 1) score += 5;

  if (blastRadiusAssetCount >= 20) score += 10;
  else if (blastRadiusAssetCount >= 10) score += 5;

  const severity: 'P1' | 'P2' | 'P3' | 'P4' =
    score >= 70 ? 'P1' : score >= 45 ? 'P2' : score >= 25 ? 'P3' : 'P4';

  const reasoning = [
    isCriticalType ? `${eventType} is a critical event type` : null,
    hasTier1Service ? 'Tier-1 business service affected' : null,
    affectedServiceCount > 1 ? `${affectedServiceCount} services impacted` : null,
    blastRadiusAssetCount > 10 ? `${blastRadiusAssetCount} assets in blast radius` : null,
  ].filter(Boolean).join('; ') || 'Standard assessment';

  return { recommendedSeverity: severity, confidence: Math.min(95, score + 10), reasoning };
}

// ─── Run all ML scoring for an SOE (called by worker) ────────────────────────

export async function runMLScoring(soeId: string, eventId: string): Promise<void> {
  logger.info('Running ML scoring', { soeId, eventId });

  const [event] = await sql<{ event_type: string; severity: string; affected_service_ids: string[] }[]>`
    SELECT event_type, severity, affected_service_ids FROM recovery_events WHERE id = ${eventId}
  `;
  if (!event) return;

  // 1. Predict duration for each step
  const steps = await sql<{
    id: string; name: string; swim_lane: string; estimated_duration_minutes: number;
  }[]>`SELECT id, name, swim_lane, estimated_duration_minutes FROM soe_steps WHERE soe_id = ${soeId}`;

  for (const step of steps) {
    const prediction = await predictStepDuration({
      stepName: step.name,
      eventType: event.event_type,
      severity: event.severity,
      swimLane: step.swim_lane,
      estimatedDurationMinutes: step.estimated_duration_minutes || 15,
    });

    await sql`
      UPDATE soe_steps
      SET ml_predicted_duration_minutes = ${prediction.predictedMinutes}
      WHERE id = ${step.id}
    `;
  }

  // 2. Detect missing steps
  const missingIds = await detectMissingSteps(soeId, event.event_type);
  if (missingIds.length > 0) {
    await sql`
      UPDATE soe_steps
      SET ml_missing_step_flag = TRUE, ml_missing_step_confidence = 0.75
      WHERE id = ANY(${missingIds})
    `;
    logger.info('Missing step flags set', { count: missingIds.length, soeId });
  }

  // 3. Calculate TTFR confidence and recovery score
  const services = event.affected_service_ids?.length > 0
    ? await sql<{ rto_minutes: number }[]>`
        SELECT rto_minutes FROM business_services
        WHERE id = ANY(${event.affected_service_ids})
        ORDER BY rto_minutes ASC LIMIT 1`
    : [];
  const rtoMinutes = services[0]?.rto_minutes;

  const confidence = await calculateRecoveryConfidence({ soeId, eventId, rtoMinutes });
  const ttfr = await calculateTTFRConfidence(soeId);

  await sql`
    UPDATE soes SET
      ml_ttfr_minutes = ${ttfr.pointEstimateMinutes},
      ml_ttfr_confidence_low = ${ttfr.p10Minutes},
      ml_ttfr_confidence_high = ${ttfr.p90Minutes},
      recovery_confidence_score = ${confidence.score / 100},
      updated_at = NOW()
    WHERE id = ${soeId}
  `;

  logger.info('ML scoring complete', { soeId, ttfr: ttfr.pointEstimateMinutes, confidence: confidence.score });
}
