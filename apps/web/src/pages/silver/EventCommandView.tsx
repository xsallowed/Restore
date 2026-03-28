import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi, api } from '../../lib/api';
import { useSSE } from '../../lib/api';
import { GanttChart } from '../../components/silver/GanttChart';
import { StepAssignModal } from '../../components/silver/StepAssignModal';
import toast from 'react-hot-toast';
import {
  Users, AlertTriangle, CheckCircle2, Clock, SkipForward,
  ChevronDown, ChevronRight, Zap, FileText, Lock, Unlock,
  TrendingUp, Shield, Bot, User, BarChart2
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';

const STATUS_COLOR: Record<string, string> = {
  NOT_STARTED: 'border-l-gray-300 bg-gray-50',
  IN_PROGRESS: 'border-l-blue-400 bg-blue-50',
  COMPLETED:   'border-l-green-400 bg-green-50',
  BLOCKED:     'border-l-red-400 bg-red-50',
  SKIPPED:     'border-l-yellow-400 bg-yellow-50',
};

const STATUS_BADGE: Record<string, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED:   'bg-green-100 text-green-700',
  BLOCKED:     'bg-red-100 text-red-700',
  SKIPPED:     'bg-yellow-100 text-yellow-700',
};

interface Step {
  id: string; name: string; description: string; status: string;
  step_type: string; swim_lane: string; sequence: number;
  is_on_critical_path: boolean; phase_name: string;
  assignee_name?: string; assigned_to?: string;
  estimated_duration_minutes: number; ml_predicted_duration_minutes?: number;
  confidence_score?: number; ml_missing_step_flag?: boolean;
  requires_approval?: boolean; approved_by?: string;
  blocked_reason?: string; skipped_reason?: string;
  dependencies: string[];
  runbook_citation?: string;
}

export function EventCommandView() {
  const { id: eventId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [assigningStep, setAssigningStep] = useState<Step | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [view, setView] = useState<'steps' | 'gantt' | 'escalations'>('steps');

  useSSE(eventId);

  const { data: eventData } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => eventsApi.get(eventId!).then(r => r.data.data),
  });

  const { data: soeData } = useQuery({
    queryKey: ['soe', eventId],
    queryFn: () => eventsApi.getSoe(eventId!).then(r => r.data.data),
    refetchInterval: 10_000,
  });

  const { data: escalationsData } = useQuery({
    queryKey: ['escalations', eventId],
    queryFn: () => api.get(`/events/${eventId}/escalations`).then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const updateStep = useMutation({
    mutationFn: ({ stepId, body }: { stepId: string; body: Record<string, unknown> }) =>
      eventsApi.updateStep(eventId!, stepId, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['soe', eventId] }); qc.invalidateQueries({ queryKey: ['gantt', eventId] }); },
    onError: () => toast.error('Failed to update step'),
  });

  const closeEvent = useMutation({
    mutationFn: () => api.patch(`/events/${eventId}`, { status: 'RESOLVED', resolvedAt: new Date() }),
    onSuccess: () => { toast.success('Event resolved'); navigate('/events'); },
    onError: () => toast.error('Failed to close event'),
  });

  const event = eventData as Record<string, unknown> | undefined;
  const soe = soeData as Record<string, unknown> | undefined;
  const steps: Step[] = (soe?.steps as Step[]) ?? [];
  const phases: { id: string; name: string }[] = (soe?.phases as { id: string; name: string }[]) ?? [];
  const escalations: Record<string, unknown>[] = escalationsData ?? [];

  const filteredSteps = selectedPhase
    ? steps.filter(s => s.phase_name === selectedPhase)
    : steps;

  // Lane grouping for parallel view
  const lanes = [...new Set(steps.map(s => s.swim_lane || 'General'))];

  const summary = {
    total:     steps.length,
    completed: steps.filter(s => s.status === 'COMPLETED').length,
    blocked:   steps.filter(s => s.status === 'BLOCKED').length,
    inProg:    steps.filter(s => s.status === 'IN_PROGRESS').length,
    missing:   steps.filter(s => s.ml_missing_step_flag).length,
  };
  const pct = summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0;
  const openEscalations = escalations.filter(e => e.status === 'OPEN').length;

  return (
    <div className="max-w-7xl mx-auto space-y-4">

      {/* Event header */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={clsx('text-xs font-bold px-2 py-0.5 rounded', {
                'bg-red-100 text-red-800': event?.severity === 'P1',
                'bg-orange-100 text-orange-800': event?.severity === 'P2',
                'bg-yellow-100 text-yellow-800': event?.severity === 'P3',
                'bg-gray-100 text-gray-700': event?.severity === 'P4',
              })}>{event?.severity as string}</span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{event?.event_type as string}</span>
              {event?.is_rehearsal && <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">REHEARSAL</span>}
              <span className={clsx('text-xs font-medium px-2 py-0.5 rounded', {
                'bg-blue-100 text-blue-700': event?.status === 'IN_PROGRESS',
                'bg-green-100 text-green-700': event?.status === 'RESOLVED',
              })}>{String(event?.status ?? '').replace('_', ' ')}</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900">{event?.title as string}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              IC: {event?.commander_name as string} ·{' '}
              Opened {event?.opened_at ? formatDistanceToNow(new Date(event.opened_at as string), { addSuffix: true }) : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/events/${eventId}/report`)}
              className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50"
            >
              <FileText size={13} /> Report
            </button>
            {event?.status === 'IN_PROGRESS' && (
              <button
                onClick={() => closeEvent.mutate()}
                disabled={closeEvent.isPending}
                className="flex items-center gap-1.5 text-xs font-medium bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle2 size={13} /> Resolve Event
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{summary.completed}/{summary.total} steps</span>
            <span className="font-medium">{pct}% complete</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* Stat bar */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Completed', value: summary.completed, color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2 },
          { label: 'In Progress', value: summary.inProg,   color: 'text-blue-600',  bg: 'bg-blue-50',  icon: Clock },
          { label: 'Blocked',    value: summary.blocked,  color: 'text-red-600',   bg: 'bg-red-50',   icon: AlertTriangle },
          { label: 'Escalations', value: openEscalations, color: openEscalations > 0 ? 'text-orange-600' : 'text-gray-500', bg: openEscalations > 0 ? 'bg-orange-50' : 'bg-gray-50', icon: Zap },
          { label: 'ML Flags',   value: summary.missing,  color: summary.missing > 0 ? 'text-purple-600' : 'text-gray-500', bg: summary.missing > 0 ? 'bg-purple-50' : 'bg-gray-50', icon: Shield },
        ].map(stat => (
          <div key={stat.label} className={clsx('rounded-xl p-3 flex items-center gap-2', stat.bg)}>
            <stat.icon size={16} className={stat.color} />
            <div>
              <p className={clsx('text-xl font-bold', stat.color)}>{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* View tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(['steps', 'gantt', 'escalations'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={clsx('px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize', {
              'bg-white text-gray-900 shadow-sm': view === v,
              'text-gray-500 hover:text-gray-700': view !== v,
            })}
          >
            {v === 'escalations' ? `Escalations${openEscalations > 0 ? ` (${openEscalations})` : ''}` : v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {/* Gantt view */}
      {view === 'gantt' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <GanttChart eventId={eventId!} />
        </div>
      )}

      {/* Escalations view */}
      {view === 'escalations' && (
        <div className="space-y-2">
          {escalations.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <CheckCircle2 size={28} className="text-green-500 mx-auto mb-2" />
              <p className="text-green-800 font-medium text-sm">No escalations raised</p>
            </div>
          ) : escalations.map(esc => (
            <div key={esc.id as string} className={clsx('bg-white border rounded-xl p-4', {
              'border-red-300': esc.severity === 'CRITICAL',
              'border-orange-300': esc.severity === 'HIGH',
              'border-yellow-300': esc.severity === 'MEDIUM',
              'border-gray-200': esc.severity === 'LOW',
            })}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={clsx('text-xs font-bold px-2 py-0.5 rounded', {
                      'bg-red-100 text-red-800': esc.severity === 'CRITICAL',
                      'bg-orange-100 text-orange-800': esc.severity === 'HIGH',
                      'bg-yellow-100 text-yellow-800': esc.severity === 'MEDIUM',
                      'bg-gray-100 text-gray-700': esc.severity === 'LOW',
                    })}>{esc.severity as string}</span>
                    <span className={clsx('text-xs px-2 py-0.5 rounded', {
                      'bg-red-50 text-red-700': esc.status === 'OPEN',
                      'bg-blue-50 text-blue-700': esc.status === 'ACKNOWLEDGED',
                      'bg-green-50 text-green-700': esc.status === 'RESOLVED',
                    })}>{esc.status as string}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900">{esc.description as string}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Raised by {esc.raised_by_name as string} · {formatDistanceToNow(new Date(esc.created_at as string), { addSuffix: true })}
                  </p>
                </div>
                {esc.status === 'OPEN' && (
                  <button
                    onClick={() => api.patch(`/escalations/${esc.id}`, { status: 'ACKNOWLEDGED' }).then(() => qc.invalidateQueries({ queryKey: ['escalations', eventId] }))}
                    className="text-xs font-medium bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-100"
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Steps view */}
      {view === 'steps' && (
        <div className="grid grid-cols-4 gap-4">
          {/* Phase filter sidebar */}
          <div className="col-span-1">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden sticky top-4">
              <div className="px-3 py-2.5 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phases</div>
              <div>
                <button
                  onClick={() => setSelectedPhase(null)}
                  className={clsx('w-full text-left px-3 py-2.5 text-sm transition-colors flex items-center justify-between', {
                    'bg-brand-50 text-brand-700 font-medium': !selectedPhase,
                    'text-gray-700 hover:bg-gray-50': !!selectedPhase,
                  })}
                >
                  All phases
                  <span className="text-xs text-gray-400">{steps.length}</span>
                </button>
                {phases.map(phase => {
                  const phaseSteps = steps.filter(s => s.phase_name === phase.name);
                  const phaseComplete = phaseSteps.filter(s => s.status === 'COMPLETED').length;
                  const phaseBlocked = phaseSteps.filter(s => s.status === 'BLOCKED').length;
                  return (
                    <button
                      key={phase.id}
                      onClick={() => setSelectedPhase(phase.name)}
                      className={clsx('w-full text-left px-3 py-2.5 text-sm transition-colors border-t border-gray-50', {
                        'bg-brand-50 text-brand-700 font-medium': selectedPhase === phase.name,
                        'text-gray-700 hover:bg-gray-50': selectedPhase !== phase.name,
                      })}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate">{phase.name}</span>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {phaseBlocked > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                          <span className="text-xs text-gray-400">{phaseComplete}/{phaseSteps.length}</span>
                        </div>
                      </div>
                      <div className="mt-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-400 rounded-full" style={{ width: phaseSteps.length ? `${Math.round(phaseComplete/phaseSteps.length*100)}%` : '0%' }} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Swim lane summary */}
              <div className="px-3 py-2.5 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Teams</p>
                {lanes.map(lane => {
                  const laneSteps = steps.filter(s => (s.swim_lane || 'General') === lane);
                  const done = laneSteps.filter(s => s.status === 'COMPLETED').length;
                  return (
                    <div key={lane} className="flex items-center justify-between py-1 text-xs text-gray-600">
                      <span className="truncate">{lane}</span>
                      <span className="text-gray-400 ml-2">{done}/{laneSteps.length}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Steps list */}
          <div className="col-span-3 space-y-2">
            {filteredSteps.map((step, idx) => {
              const isExpanded = expandedStep === step.id;
              return (
                <div key={step.id} className={clsx('bg-white border-l-4 rounded-xl border border-gray-200 overflow-hidden', STATUS_COLOR[step.status])}>
                  {/* Step row */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                    onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                  >
                    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0">
                      {step.sequence}
                    </span>

                    {step.step_type === 'AUTOMATED'
                      ? <Bot size={14} className="text-purple-500 shrink-0" />
                      : <User size={14} className="text-gray-400 shrink-0" />
                    }

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {step.is_on_critical_path && <span className="text-red-500 text-xs font-bold">★CP</span>}
                        <p className="font-medium text-sm text-gray-900 truncate">{step.name}</p>
                        {step.ml_missing_step_flag && <Shield size={12} className="text-orange-500 shrink-0" title="Possible missing step" />}
                        {step.requires_approval && !step.approved_by && <Lock size={12} className="text-purple-500 shrink-0" title="Awaiting approval" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{step.swim_lane || 'General'}</span>
                        {step.assignee_name && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Users size={10} />{step.assignee_name}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock size={10} />{step.ml_predicted_duration_minutes || step.estimated_duration_minutes || '?'} min
                        </span>
                        {step.confidence_score !== undefined && step.confidence_score < 0.6 && (
                          <span className="text-xs text-amber-600">Low confidence</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', STATUS_BADGE[step.status])}>
                        {step.status.replace('_', ' ')}
                      </span>

                      {/* Quick IC actions */}
                      {step.status !== 'COMPLETED' && (
                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => setAssigningStep(step)}
                            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded flex items-center gap-1"
                          >
                            <Users size={11} /> Assign
                          </button>
                          {step.status === 'IN_PROGRESS' && (
                            <button
                              onClick={() => updateStep.mutate({ stepId: step.id, body: { status: 'COMPLETED' } })}
                              className="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2 py-1 rounded"
                            >
                              ✓ Done
                            </button>
                          )}
                          {step.status === 'BLOCKED' && (
                            <button
                              onClick={() => updateStep.mutate({ stepId: step.id, body: { status: 'IN_PROGRESS' }, })}
                              className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded flex items-center gap-1"
                            >
                              <Unlock size={11} /> Unblock
                            </button>
                          )}
                          {step.requires_approval && !step.approved_by && (
                            <button
                              onClick={() => api.post(`/events/${eventId}/steps/${step.id}/approve`).then(() => qc.invalidateQueries({ queryKey: ['soe', eventId] }))}
                              className="text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 px-2 py-1 rounded"
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      )}

                      {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-2">
                      <p className="text-sm text-gray-600">{step.description}</p>

                      {step.runbook_citation && (
                        <p className="text-xs text-gray-400 italic flex items-center gap-1">
                          <FileText size={11} /> Source: {step.runbook_citation}
                        </p>
                      )}

                      {step.blocked_reason && (
                        <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-700">
                          Blocked: {step.blocked_reason}
                        </div>
                      )}

                      {step.ml_missing_step_flag && (
                        <div className="bg-orange-50 border border-orange-200 rounded px-3 py-2 text-xs text-orange-700 flex items-center gap-2">
                          <Shield size={12} />
                          AI analysis suggests this step type may be important for {event?.event_type as string} recovery
                        </div>
                      )}

                      {step.dependencies?.length > 0 && (
                        <p className="text-xs text-gray-400">
                          Depends on {step.dependencies.length} step(s)
                        </p>
                      )}

                      {/* IC override controls */}
                      <div className="flex gap-2 flex-wrap pt-1">
                        {step.status !== 'COMPLETED' && step.status !== 'NOT_STARTED' && (
                          <button
                            onClick={() => updateStep.mutate({ stepId: step.id, body: { status: 'SKIPPED', skippedReason: 'IC override — skipped during active event' } })}
                            className="text-xs flex items-center gap-1 text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-1 rounded hover:bg-yellow-100"
                          >
                            <SkipForward size={11} /> IC Skip
                          </button>
                        )}
                        <button
                          onClick={() => setAssigningStep(step)}
                          className="text-xs flex items-center gap-1 text-gray-700 bg-gray-50 border border-gray-200 px-2 py-1 rounded hover:bg-gray-100"
                        >
                          <Users size={11} /> Reassign
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredSteps.length === 0 && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
                No steps in this phase yet
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step assignment modal */}
      {assigningStep && (
        <StepAssignModal
          step={assigningStep}
          eventId={eventId!}
          onClose={() => setAssigningStep(null)}
          onAssigned={() => {
            setAssigningStep(null);
            qc.invalidateQueries({ queryKey: ['soe', eventId] });
          }}
        />
      )}
    </div>
  );
}
