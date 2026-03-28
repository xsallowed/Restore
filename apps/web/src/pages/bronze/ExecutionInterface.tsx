import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { eventsApi } from '../../lib/api';
import { useSSE } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { GanttChart } from '../../components/silver/GanttChart';
import { RunbookViewer } from '../../components/shared/RunbookViewer';
import { EscalationModal } from '../../components/shared/EscalationModal';
import toast from 'react-hot-toast';
import {
  CheckCircle2, Clock, AlertTriangle, SkipForward,
  Paperclip, ChevronDown, ChevronUp, Bot, User, Shield
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';

const STATUS_STYLES: Record<string, { border: string; bg: string; label: string; icon: React.ElementType }> = {
  NOT_STARTED: { border: 'border-gray-200', bg: 'bg-gray-50',   label: 'Not Started', icon: Clock },
  IN_PROGRESS: { border: 'border-blue-400', bg: 'bg-blue-50',   label: 'In Progress', icon: Clock },
  COMPLETED:   { border: 'border-green-400', bg: 'bg-green-50',  label: 'Completed',   icon: CheckCircle2 },
  SKIPPED:     { border: 'border-yellow-400', bg: 'bg-yellow-50', label: 'Skipped',    icon: SkipForward },
  BLOCKED:     { border: 'border-red-400',  bg: 'bg-red-50',    label: 'Blocked',     icon: AlertTriangle },
};

export function ExecutionInterface() {
  const { id: eventId } = useParams<{ id: string }>();
  const { user, isAtLeast } = useAuth();
  const qc = useQueryClient();
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [showGantt, setShowGantt] = useState(isAtLeast('SILVER'));

  useSSE(eventId);

  const { data: eventData } = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => eventsApi.get(eventId!).then(r => r.data.data),
  });

  const { data: soeData, isLoading } = useQuery({
    queryKey: ['soe', eventId],
    queryFn: () => eventsApi.getSoe(eventId!).then(r => r.data.data),
    refetchInterval: 10_000,
  });

  const updateStepMutation = useMutation({
    mutationFn: ({ stepId, body }: { stepId: string; body: unknown }) =>
      eventsApi.updateStep(eventId!, stepId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['soe', eventId] });
      qc.invalidateQueries({ queryKey: ['gantt', eventId] });
    },
    onError: () => toast.error('Failed to update step'),
  });

  const addEvidenceMutation = useMutation({
    mutationFn: ({ stepId, content }: { stepId: string; content: string }) =>
      eventsApi.addEvidence(eventId!, stepId, { evidenceType: 'NOTE', content }),
    onSuccess: () => {
      setNoteText('');
      toast.success('Note saved');
    },
    onError: () => toast.error('Failed to save note'),
  });

  const event = eventData as Record<string, unknown> | undefined;
  const soe = soeData as Record<string, unknown> | undefined;
  const steps: Record<string, unknown>[] = (soe?.steps as Record<string, unknown>[]) ?? [];

  const completedCount = steps.filter(s => s.status === 'COMPLETED').length;
  const pct = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Generating Sequence of Events…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Event header */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={clsx(
                'text-xs font-bold px-2 py-0.5 rounded',
                event?.severity === 'P1' ? 'bg-red-100 text-red-800' :
                event?.severity === 'P2' ? 'bg-orange-100 text-orange-800' :
                'bg-yellow-100 text-yellow-800'
              )}>
                {event?.severity as string}
              </span>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                {event?.event_type as string}
              </span>
              {event?.is_rehearsal && (
                <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">REHEARSAL</span>
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{event?.title as string}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Opened {event?.opened_at ? formatDistanceToNow(new Date(event.opened_at as string), { addSuffix: true }) : ''}
            </p>
          </div>

          {/* Progress */}
          <div className="text-right">
            <p className="text-2xl font-bold text-gray-900">{pct}%</p>
            <p className="text-xs text-gray-500">{completedCount} of {steps.length} steps complete</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Gantt toggle (Silver+) */}
      {isAtLeast('SILVER') && (
        <button
          onClick={() => setShowGantt(g => !g)}
          className="flex items-center gap-2 text-sm text-brand-600 font-medium mb-4 hover:text-brand-700"
        >
          {showGantt ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          {showGantt ? 'Hide' : 'Show'} Recovery Gantt Chart
        </button>
      )}

      {/* Gantt chart */}
      {showGantt && isAtLeast('SILVER') && (
        <div className="mb-6 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <GanttChart eventId={eventId!} />
        </div>
      )}

      {/* Steps list */}
      <div className="space-y-2">
        {steps.map((step, idx) => {
          const style = STATUS_STYLES[step.status as string] ?? STATUS_STYLES.NOT_STARTED;
          const isExpanded = expandedStep === step.id;
          const isMyStep = step.assigned_to === user?.sub;
          const canAct = isMyStep || isAtLeast('SILVER');

          return (
            <div
              key={step.id as string}
              className={clsx('rounded-xl border-2 transition-all', style.border, style.bg)}
            >
              {/* Step header */}
              <div
                className="flex items-center gap-3 p-4 cursor-pointer"
                onClick={() => setExpandedStep(isExpanded ? null : step.id as string)}
              >
                {/* Step number */}
                <span className="w-6 h-6 rounded-full bg-gray-200 text-gray-700 text-xs font-bold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>

                {/* Type indicator */}
                {step.step_type === 'AUTOMATED'
                  ? <Bot size={15} className="text-purple-500 shrink-0" />
                  : <User size={15} className="text-gray-400 shrink-0" />
                }

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className={clsx('font-medium text-sm', step.is_on_critical_path && 'text-red-700')}>
                    {step.is_on_critical_path && <span className="text-red-500 mr-1">★</span>}
                    {step.name as string}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{step.swim_lane as string}</p>
                </div>

                {/* Duration */}
                <span className="text-xs text-gray-400 shrink-0">
                  {step.ml_predicted_duration_minutes || step.estimated_duration_minutes || '?'} min
                </span>

                {/* Status badge */}
                <span className={clsx(
                  'text-xs font-medium px-2 py-0.5 rounded-full shrink-0',
                  step.status === 'COMPLETED' ? 'bg-green-200 text-green-800' :
                  step.status === 'IN_PROGRESS' ? 'bg-blue-200 text-blue-800' :
                  step.status === 'BLOCKED' ? 'bg-red-200 text-red-800' :
                  step.status === 'SKIPPED' ? 'bg-yellow-200 text-yellow-800' :
                  'bg-gray-200 text-gray-600'
                )}>
                  {style.label}
                </span>

                {step.ml_missing_step_flag && (
                  <Shield size={14} className="text-orange-500 shrink-0" title="ML: This step may be required" />
                )}
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-200/60 pt-3 space-y-3">
                  <p className="text-sm text-gray-700">{step.description as string}</p>

                  {step.runbook_citation && (
                    <p className="text-xs text-gray-400 italic">Source: {step.runbook_citation as string}</p>
                  )}

                  {step.ml_missing_step_flag && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 text-xs text-orange-800 flex items-center gap-2">
                      <Shield size={13} />
                      AI suggests this step may be required based on the current incident context
                    </div>
                  )}

                  {/* Action buttons */}
                  {canAct && step.status !== 'COMPLETED' && (
                    <div className="flex gap-2 flex-wrap">
                      {step.status === 'NOT_STARTED' && (
                        <button
                          onClick={() => updateStepMutation.mutate({ stepId: step.id as string, body: { status: 'IN_PROGRESS' } })}
                          className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700"
                        >
                          Start Step
                        </button>
                      )}
                      {step.status === 'IN_PROGRESS' && (
                        <button
                          onClick={() => updateStepMutation.mutate({ stepId: step.id as string, body: { status: 'COMPLETED' } })}
                          className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700"
                        >
                          Mark Complete
                        </button>
                      )}
                      <button
                        onClick={() => updateStepMutation.mutate({ stepId: step.id as string, body: { status: 'BLOCKED', blockedReason: 'Manually blocked' } })}
                        className="text-xs font-medium bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200"
                      >
                        Blocked
                      </button>
                      <button
                        onClick={() => updateStepMutation.mutate({ stepId: step.id as string, body: { status: 'SKIPPED', skippedReason: 'Manually skipped' } })}
                        className="text-xs font-medium bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200"
                      >
                        Skip
                      </button>
                    </div>
                  )}

                  {/* Embedded runbook viewer (FR3.7) */}
                  {(step.runbook_id || step.runbook_citation) && (
                    <RunbookViewer runbookId={step.runbook_id as string} citation={step.runbook_citation as string} stepName={step.name as string} />
                  )}

                  {/* Evidence / Notes */}
                  <div className="flex gap-2">
                    <textarea
                      value={expandedStep === step.id ? noteText : ''}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="Add a note or observation…"
                      className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none h-16 focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                    <button
                      onClick={() => noteText.trim() && addEvidenceMutation.mutate({ stepId: step.id as string, content: noteText })}
                      disabled={!noteText.trim() || addEvidenceMutation.isPending}
                      className="self-end flex items-center gap-1 text-xs font-medium bg-brand-600 text-white px-3 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-40"
                    >
                      <Paperclip size={12} />
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {steps.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center">
          <div className="w-10 h-10 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-blue-700 font-medium">Generating Sequence of Events from runbooks…</p>
          <p className="text-xs text-blue-500 mt-1">This typically takes 15-30 seconds</p>
        </div>
      )}
    </div>
  );
}
