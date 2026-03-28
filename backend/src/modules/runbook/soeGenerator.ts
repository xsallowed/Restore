import { sql } from '../../lib/db';
import { callLLM, parseJsonResponse } from '../../llm/provider';
import { logger } from '../../lib/logger';

interface GeneratedStep {
  sequence: number;
  name: string;
  description: string;
  stepType: 'HUMAN' | 'AUTOMATED';
  swimLane: string;
  estimatedDurationMinutes: number;
  runbookSourceRef?: string;
  runbookCitation?: string;
  dependencies: number[];        // relative sequence numbers of predecessors
  isOnCriticalPath: boolean;
  requiresApproval: boolean;
  phase: string;
  confidenceScore: number;
}

interface GeneratedSOE {
  title: string;
  phases: string[];
  steps: GeneratedStep[];
  totalEstimatedMinutes: number;
}

export async function generateSOE(params: {
  eventId: string;
  eventType: string;
  severity: string;
  affectedServiceIds: string[];
  isRehearsal?: boolean;
}): Promise<string> {
  const { eventId, eventType, severity, affectedServiceIds } = params;

  logger.info('Starting SOE generation', { eventId, eventType, severity });

  // Stage 1: Find relevant runbooks
  const runbooks = await sql<{ id: string; title: string; content_text: string; source_ref: string }[]>`
    SELECT id, title, content_text, source_ref
    FROM runbooks
    WHERE (
        event_tags && ARRAY[${eventType}]::text[]
        OR cardinality(event_tags) = 0
      )
    ORDER BY
      CASE WHEN event_tags && ARRAY[${eventType}]::text[] THEN 0 ELSE 1 END,
      fetched_at DESC
    LIMIT 8
  `;

  if (!runbooks.length) {
    logger.warn('No runbooks found — generating generic SOE', { eventType });
  }

  // Stage 2: Classify and select most relevant content
  const runbookContext = runbooks.map((r, i) =>
    `[RUNBOOK ${i + 1}: ${r.title}]\n${r.content_text.slice(0, 2000)}`
  ).join('\n\n---\n\n');

  // Get affected business services for context
  const services = affectedServiceIds.length > 0
    ? await sql<{ name: string }[]>`SELECT name FROM business_services WHERE id = ANY(${affectedServiceIds})`
    : [];

  const serviceNames = services.map(s => s.name).join(', ') || 'All services';

  // Stage 3: Extract and structure steps
  const extractionPrompt = `You are an expert incident recovery planner. Generate a structured Sequence of Events (SOE) for the following recovery scenario.

EVENT TYPE: ${eventType}
SEVERITY: ${severity}
AFFECTED SERVICES: ${serviceNames}

AVAILABLE RUNBOOKS:
${runbookContext || 'No specific runbooks available — generate based on best practice.'}

Generate a complete, realistic SOE as JSON. Follow this exact schema:
{
  "title": "string",
  "phases": ["string"],
  "steps": [
    {
      "sequence": 1,
      "name": "Short action name",
      "description": "Detailed step description with specific actions",
      "stepType": "HUMAN or AUTOMATED",
      "swimLane": "Team name (e.g. Network Team, Security Team, DBA Team)",
      "estimatedDurationMinutes": 15,
      "dependencies": [],
      "isOnCriticalPath": true,
      "requiresApproval": false,
      "phase": "Containment",
      "confidenceScore": 0.9,
      "runbookCitation": "Source reference if from runbook, otherwise null"
    }
  ],
  "totalEstimatedMinutes": 240
}

Rules:
- Include 8-20 steps appropriate for ${severity} severity
- Group into phases: Identification, Containment, Eradication, Recovery, Post-Incident
- Mark parallel steps with same dependencies (they can run simultaneously)
- Mark the critical path accurately (longest path through dependencies)
- AUTOMATED steps should have requiresApproval: true by default
- Be specific and actionable in descriptions
- Respond ONLY with valid JSON, no markdown fences`;

  const rawSOE = await callLLM('soe_extraction', [
    { role: 'system', content: 'You are a cybersecurity and IT recovery expert. Always respond with valid JSON only.' },
    { role: 'user', content: extractionPrompt },
  ], 0.1);

  let generatedSOE: GeneratedSOE;
  try {
    generatedSOE = parseJsonResponse<GeneratedSOE>(rawSOE);
  } catch {
    logger.error('Failed to parse LLM SOE response', { rawSOE: rawSOE.slice(0, 500) });
    // Fallback: create a basic SOE
    generatedSOE = buildFallbackSOE(eventType, severity);
  }

  // Stage 4: Persist the SOE
  const [soe] = await sql<{ id: string }[]>`
    INSERT INTO soes (event_id, scope_type, status, total_estimated_minutes)
    VALUES (${eventId}, 'FULL_ORG', 'DRAFT', ${generatedSOE.totalEstimatedMinutes})
    RETURNING id
  `;

  // Create phases
  const phaseMap: Record<string, string> = {};
  for (let i = 0; i < generatedSOE.phases.length; i++) {
    const phaseName = generatedSOE.phases[i];
    const [phase] = await sql<{ id: string }[]>`
      INSERT INTO soe_phases (soe_id, name, sequence)
      VALUES (${soe.id}, ${phaseName}, ${i + 1})
      RETURNING id
    `;
    phaseMap[phaseName] = phase.id;
  }

  // Create steps
  const stepIdMap: Record<number, string> = {};
  for (const step of generatedSOE.steps) {
    // Find matching runbook
    const runbook = runbooks.find(r =>
      step.runbookCitation && r.source_ref.includes(step.runbookCitation.split(',')[0])
    );

    const [dbStep] = await sql<{ id: string }[]>`
      INSERT INTO soe_steps (
        soe_id, phase_id, sequence, name, description, step_type, swim_lane,
        estimated_duration_minutes, confidence_score, runbook_id, runbook_citation,
        is_on_critical_path, requires_approval
      ) VALUES (
        ${soe.id},
        ${phaseMap[step.phase] ?? null},
        ${step.sequence},
        ${step.name},
        ${step.description},
        ${step.stepType},
        ${step.swimLane},
        ${step.estimatedDurationMinutes},
        ${step.confidenceScore},
        ${runbook?.id ?? null},
        ${step.runbookCitation ?? null},
        ${step.isOnCriticalPath},
        ${step.requiresApproval}
      )
      RETURNING id
    `;
    stepIdMap[step.sequence] = dbStep.id;
  }

  // Update dependencies now that all step IDs are known
  for (const step of generatedSOE.steps) {
    if (step.dependencies.length > 0) {
      const depIds = step.dependencies.map(d => stepIdMap[d]).filter(Boolean);
      if (depIds.length > 0) {
        await sql`
          UPDATE soe_steps SET dependencies = ${depIds}
          WHERE id = ${stepIdMap[step.sequence]}
        `;
      }
    }
  }

  logger.info('SOE generation complete', { soeId: soe.id, stepCount: generatedSOE.steps.length });
  return soe.id;
}

function buildFallbackSOE(eventType: string, severity: string): GeneratedSOE {
  return {
    title: `${eventType} Recovery SOE (${severity})`,
    phases: ['Identification', 'Containment', 'Eradication', 'Recovery', 'Post-Incident'],
    steps: [
      { sequence: 1, name: 'Assess impact', description: 'Assess the full scope and impact of the incident on business services.', stepType: 'HUMAN', swimLane: 'Security Team', estimatedDurationMinutes: 15, dependencies: [], isOnCriticalPath: true, requiresApproval: false, phase: 'Identification', confidenceScore: 0.8 },
      { sequence: 2, name: 'Notify stakeholders', description: 'Notify Incident Commander and relevant team leads.', stepType: 'HUMAN', swimLane: 'Security Team', estimatedDurationMinutes: 10, dependencies: [1], isOnCriticalPath: false, requiresApproval: false, phase: 'Identification', confidenceScore: 0.8 },
      { sequence: 3, name: 'Isolate affected systems', description: 'Isolate affected systems to prevent further spread.', stepType: 'HUMAN', swimLane: 'Network Team', estimatedDurationMinutes: 30, dependencies: [1], isOnCriticalPath: true, requiresApproval: false, phase: 'Containment', confidenceScore: 0.8 },
      { sequence: 4, name: 'Eradicate root cause', description: 'Remove the root cause of the incident and apply necessary patches.', stepType: 'HUMAN', swimLane: 'Security Team', estimatedDurationMinutes: 60, dependencies: [3], isOnCriticalPath: true, requiresApproval: false, phase: 'Eradication', confidenceScore: 0.7 },
      { sequence: 5, name: 'Restore services', description: 'Restore affected services in priority order.', stepType: 'HUMAN', swimLane: 'Operations Team', estimatedDurationMinutes: 45, dependencies: [4], isOnCriticalPath: true, requiresApproval: false, phase: 'Recovery', confidenceScore: 0.8 },
      { sequence: 6, name: 'Verify restoration', description: 'Verify all services are restored and operating normally.', stepType: 'HUMAN', swimLane: 'Operations Team', estimatedDurationMinutes: 20, dependencies: [5], isOnCriticalPath: true, requiresApproval: false, phase: 'Recovery', confidenceScore: 0.9 },
      { sequence: 7, name: 'Post-incident review', description: 'Conduct post-incident review and capture lessons learned.', stepType: 'HUMAN', swimLane: 'All Teams', estimatedDurationMinutes: 60, dependencies: [6], isOnCriticalPath: false, requiresApproval: false, phase: 'Post-Incident', confidenceScore: 0.9 },
    ],
    totalEstimatedMinutes: 240,
  };
}
