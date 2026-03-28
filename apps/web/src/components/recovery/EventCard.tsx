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
  P1: { border: 'border-red-500 border-opacity-30', badge: 'bg-red-500 bg-opacity-20 text-red-200', text: 'text-red-400', label: 'Critical', icon: '🔴' },
  P2: { border: 'border-accent-orange border-opacity-30', badge: 'bg-accent-orange bg-opacity-20 text-accent-orange', text: 'text-accent-orange', label: 'High', icon: '🟠' },
  P3: { border: 'border-accent-gold border-opacity-30', badge: 'bg-accent-gold bg-opacity-20 text-dark-950', text: 'text-accent-gold', label: 'Medium', icon: '🟡' },
  P4: { border: 'border-brand-600 border-opacity-30', badge: 'bg-brand-600 bg-opacity-20 text-brand-200', text: 'text-brand-400', label: 'Low', icon: '⚪' },
};

const STATUS_CONFIG = {
  OPEN: { dot: 'bg-red-500', label: 'Open', badge: 'bg-red-500 bg-opacity-20 text-red-200' },
  IN_PROGRESS: { dot: 'bg-brand-500', label: 'Active', badge: 'bg-brand-500 bg-opacity-20 text-brand-200' },
  RESOLVED: { dot: 'bg-accent-gold', label: 'Resolved', badge: 'bg-accent-gold bg-opacity-20 text-dark-950' },
  CLOSED: { dot: 'bg-dark-200', label: 'Closed', badge: 'bg-dark-200 bg-opacity-20 text-dark-200' },
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
        'group relative rounded-lg border p-5 cursor-pointer transition-all duration-300',
        'hover:shadow-glow hover:border-opacity-100 hover:-translate-y-0.5',
        'bg-dark-900 bg-opacity-50 backdrop-blur-sm',
        severityCfg.border,
        'border'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3">
            <span className={clsx('text-xs font-semibold px-2.5 py-1.5 rounded-md', severityCfg.badge)}>
              {severityCfg.icon} {severity}
            </span>
            <span className={clsx('text-xs font-semibold px-2.5 py-1.5 rounded-md', statusCfg.badge)}>
              {statusCfg.label}
            </span>
          </div>
          <h3 className="text-base font-semibold text-white mb-1.5">{title}</h3>
          <p className="text-sm text-dark-200">{event_type}</p>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2.5 mb-5">
        <div className="flex items-center gap-2.5 text-sm">
          <Clock size={14} className="text-dark-200 shrink-0" />
          <span className="text-dark-200">{timeSinceOpen}</span>
        </div>

        {commander_name && (
          <div className="flex items-center gap-2.5 text-sm">
            <Users size={14} className="text-dark-200 shrink-0" />
            <span className="text-dark-200">{commander_name}</span>
          </div>
        )}

        {affected_service_ids && affected_service_ids.length > 0 && (
          <div className="flex items-center gap-2.5 text-sm">
            <Target size={14} className="text-dark-200 shrink-0" />
            <span className="text-dark-200">{affected_service_ids.length} services affected</span>
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        className={clsx(
          'w-full text-sm font-medium py-2.5 rounded-lg transition-all duration-200',
          'flex items-center justify-center gap-2',
          'border border-brand-600 hover:border-accent-orange hover:shadow-glow',
          'text-brand-400 hover:text-accent-orange',
          'bg-transparent hover:bg-brand-600 hover:bg-opacity-10',
          'group-hover:gap-3'
        )}
      >
        {status === 'OPEN' ? 'Open Details' : status === 'IN_PROGRESS' ? 'Continue' : 'Review'}
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}
