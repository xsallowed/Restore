// ── EventListPage ─────────────────────────────────────────────────────────────
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { eventsApi, auditApi } from '../../lib/api';
import { useAuth } from '../../store/auth';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, CheckCircle, Clock, Play } from 'lucide-react';
import clsx from 'clsx';

export function EventListPage() {
  const { isAtLeast } = useAuth();
  const navigate = useNavigate();

  const { data: liveData, isLoading } = useQuery({
    queryKey: ['events', 'all'],
    queryFn: () => eventsApi.list({ rehearsal: false }).then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const { data: rehearsalData } = useQuery({
    queryKey: ['events', 'rehearsal'],
    queryFn: () => eventsApi.list({ rehearsal: true }).then(r => r.data.data),
    enabled: isAtLeast('SILVER'),
  });

  const events: Record<string, unknown>[] = (liveData as Record<string, unknown>[]) ?? [];
  const rehearsals: Record<string, unknown>[] = (rehearsalData as Record<string, unknown>[]) ?? [];

  const STATUS_ICON: Record<string, React.ElementType> = {
    OPEN: AlertTriangle,
    IN_PROGRESS: Clock,
    RESOLVED: CheckCircle,
    CLOSED: CheckCircle,
  };

  const STATUS_COLOR: Record<string, string> = {
    OPEN:        'text-red-500 bg-dark-800',
    IN_PROGRESS: 'text-purple-600 bg-dark-800',
    RESOLVED:    'text-gold bg-dark-800',
    CLOSED:      'text-white bg-dark-800',
  };

  const EventCard = ({ event, isRehearsal = false }: { event: Record<string, unknown>; isRehearsal?: boolean }) => {
    const Icon = STATUS_ICON[event.status as string] ?? Clock;
    return (
      <div
        onClick={() => navigate(`/events/${event.id}`)}
        className="bg-dark-900 bg-opacity-50 border border-gray-600 rounded-xl p-4 cursor-pointer hover:border-brand-400 hover:shadow-sm transition-all flex items-center gap-3"
      >
        <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center shrink-0', STATUS_COLOR[event.status as string])}>
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            {isRehearsal && <span className="text-xs font-bold bg-amber-100 text-gold px-1.5 py-0.5 rounded">REHEARSAL</span>}
            <span className={clsx('text-xs font-bold px-1.5 py-0.5 rounded', {
              'bg-red-100 text-red-800': event.severity === 'P1',
              'bg-orange-100 text-orange-800': event.severity === 'P2',
              'bg-yellow-100 text-yellow-800': event.severity === 'P3',
              'bg-dark-700 text-gray-600': event.severity === 'P4',
            })}>{event.severity as string}</span>
            <span className="font-medium text-white text-sm truncate">{event.title as string}</span>
          </div>
          <p className="text-xs text-white">
            {event.event_type as string} · {formatDistanceToNow(new Date(event.opened_at as string), { addSuffix: true })}
          </p>
        </div>
        <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', STATUS_COLOR[event.status as string])}>
          {String(event.status).replace('_', ' ')}
        </span>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Recovery Events</h1>
        {isAtLeast('SILVER') && (
          <button onClick={() => navigate('/events/new')} className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700">
            <AlertTriangle size={14} />
            Open Event
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-white text-sm">Loading…</div>
      ) : (
        <div className="space-y-2">
          {events.map(e => <EventCard key={e.id as string} event={e} />)}
          {events.length === 0 && (
            <div className="bg-dark-800 border border-green-200 rounded-xl p-8 text-center">
              <CheckCircle size={32} className="text-gold mx-auto mb-2" />
              <p className="text-green-800 font-medium">No active recovery events</p>
              <p className="text-green-600 text-sm mt-1">All systems operational</p>
            </div>
          )}
        </div>
      )}

      {rehearsals.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Play size={13} /> Recent Rehearsals
          </h2>
          <div className="space-y-2">
            {rehearsals.map(e => <EventCard key={e.id as string} event={e} isRehearsal />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AuditPage ─────────────────────────────────────────────────────────────────
export function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: () => auditApi.list({ limit: 100 }).then(r => r.data.data),
    refetchInterval: 60_000,
  });

  const entries: Record<string, unknown>[] = (data as Record<string, unknown>[]) ?? [];

  const ACTION_COLOR: Record<string, string> = {
    EVENT_OPENED:    'bg-red-100 text-red-800',
    STEP_UPDATED:    'bg-blue-100 text-blue-800',
    STEP_COMPLETED:  'bg-green-100 text-green-800',
    EVIDENCE_ADDED:  'bg-purple-100 text-purple-800',
    USER_LOGIN:      'bg-dark-700 text-gray-300',
    AUTOMATION_CALLBACK: 'bg-orange-100 text-orange-800',
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Audit Log</h1>
        <p className="text-sm text-gray-300 mt-0.5">Tamper-evident record of all platform actions</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-white text-sm">Loading audit log…</div>
      ) : (
        <div className="bg-dark-900 bg-opacity-50 border border-gray-600 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-dark-800 border-b border-gray-700 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wide">#</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wide">Timestamp</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wide">Action</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wide">User</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wide">Object</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wide">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map(entry => (
                <tr key={entry.id as string} className="hover:bg-dark-800">
                  <td className="px-4 py-3 text-xs text-white font-mono">{entry.sequence as number}</td>
                  <td className="px-4 py-3 text-xs text-gray-300">
                    {new Date(entry.created_at as string).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded', ACTION_COLOR[entry.action as string] ?? 'bg-dark-700 text-gray-600')}>
                      {String(entry.action).replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-300">{entry.user_name as string ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-300 font-mono truncate max-w-xs">
                    {entry.object_type as string ?? '–'} {entry.object_id ? `·${String(entry.object_id).slice(0,8)}…` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs px-1.5 py-0.5 rounded', {
                      'bg-amber-100 text-gold': entry.user_tier === 'BRONZE',
                      'bg-blue-100 text-blue-800': entry.user_tier === 'SILVER',
                      'bg-green-100 text-green-800': entry.user_tier === 'GOLD',
                      'bg-dark-700 text-gray-600': !entry.user_tier,
                    })}>
                      {entry.user_tier as string ?? 'system'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && (
            <div className="px-4 py-12 text-center text-white text-sm">No audit entries yet</div>
          )}
        </div>
      )}
    </div>
  );
}
