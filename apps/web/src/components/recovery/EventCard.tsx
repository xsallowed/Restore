import { AlertTriangle, Clock, Users, Target, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

interface EventCardProps {
  id: string;
  title: string;
  event_type: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  opened_at: string;
  commander_name?: string;
  commander_id?: string;
  affected_service_ids?: string[];
  onClick: () => void;
}

const SEVERITY_CONFIG = {
  P1: { bg: 'bg-red-50', border: 'border-red-200', badge: 'bg-red-100 text-red-700', text: 'text-red-600', label: 'Critical', icon: '🔴' },
  P2: { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700', text: 'text-amber-600', label: 'High', icon: '🟠' },
  P3: { bg: 'bg-yellow-50', border: 'border-yellow-200', badge: 'bg-yellow-100 text-yellow-700', text: 'text-yellow-600', label: 'Medium', icon: '🟡' },
  P4: { bg: 'bg-slate-50', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-700', text: 'text-slate-600', label: 'Low', icon: '⚪' },
};

const STATUS_CONFIG = {
  OPEN: { dot: 'bg-red-500', label: 'Open', badge: 'bg-red-100 text-red-700' },
  IN_PROGRESS: { dot: 'bg-blue-500', label: 'Active', badge: 'bg-blue-100 text-blue-700' },
  RESOLVED: { dot: 'bg-emerald-500', label: 'Resolved', badge: 'bg-emerald-100 text-emerald-700' },
  CLOSED: { dot: 'bg-slate-400', label: 'Closed', badge: 'bg-slate-100 text-slate-600' },
};

export function EventCard({
  id,
  title,
  event_type,
  severity,
  status,
  opened_at,
  commander_name,
  affected_service_ids,
  onClick,
}: EventCardProps) {
  const severityCfg = SEVERITY_CONFIG[severity];
  const statusCfg = STATUS_CONFIG[status];
  const timeSinceOpen = formatDistanceToNow(new Date(opened_at), { addSuffix: true });

  return (
    <div
      onClick={onClick}
      className={clsx(
        'group relative rounded-xl border p-6 cursor-pointer transition-all duration-300',
        'hover:shadow-lg hover:-translate-y-1',
        'bg-white',
        severityCfg.border,
        'border'
      )}
    >
      {/* Gradient accent top */}
      <div className={clsx(
        'absolute top-0 left-0 right-0 h-1 rounded-t-xl transition-all',
        severity === 'P1' ? 'bg-gradient-to-r from-red-500 to-red-400' :
        severity === 'P2' ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
        severity === 'P3' ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' :
        'bg-gradient-to-r from-slate-500 to-slate-400'
      )} />

      {/* Header */}
      <div className="flex items-start justify-between mb-4 pt-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <span className={clsx('text-xs font-semibold px-2.5 py-1.5 rounded-md', severityCfg.badge)}>
              {severityCfg.icon} {severity}
            </span>
            <span className={clsx('text-xs font-semibold px-2.5 py-1.5 rounded-md', statusCfg.badge)}>
              {statusCfg.label}
            </span>
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1.5">{title}</h3>
          <p className="text-sm text-slate-500">{event_type}</p>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2.5 mb-5">
        <div className="flex items-center gap-2.5 text-sm">
          <Clock size={14} className="text-slate-400 shrink-0" />
          <span className="text-slate-600">{timeSinceOpen}</span>
        </div>

        {commander_name && (
          <div className="flex items-center gap-2.5 text-sm">
            <Users size={14} className="text-slate-400 shrink-0" />
            <span className="text-slate-600">{commander_name}</span>
          </div>
        )}

        {affected_service_ids && affected_service_ids.length > 0 && (
          <div className="flex items-center gap-2.5 text-sm">
            <Target size={14} className="text-slate-400 shrink-0" />
            <span className="text-slate-600">{affected_service_ids.length} services affected</span>
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        className={clsx(
          'w-full text-sm font-medium py-2.5 rounded-lg transition-all duration-200',
          'flex items-center justify-center gap-2',
          'bg-slate-50 hover:bg-brand-50',
          'text-brand-600 hover:text-brand-700',
          'group-hover:gap-3'
        )}
      >
        {status === 'OPEN' ? 'Open Details' : status === 'IN_PROGRESS' ? 'Continue' : 'Review'}
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}
