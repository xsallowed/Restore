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
  P1: { border: 'border-red-500 border-opacity-40', badge: 'bg-red-600 text-red-100', text: 'text-red-400', label: 'Critical', icon: '🔴' },
  P2: { border: 'border-orange border-opacity-40', badge: 'bg-orange text-white', text: 'text-orange', label: 'High', icon: '🟠' },
  P3: { border: 'border-gold border-opacity-40', badge: 'bg-gold text-white', text: 'text-gold', label: 'Medium', icon: '🟡' },
  P4: { border: 'border-purple-600 border-opacity-40', badge: 'bg-purple-600 text-purple-100', text: 'text-purple-400', label: 'Low', icon: '⚪' },
};

const STATUS_CONFIG = {
  OPEN: { dot: 'bg-red-600', label: 'Open', badge: 'bg-red-600 text-red-100' },
  IN_PROGRESS: { dot: 'bg-purple-600', label: 'Active', badge: 'bg-purple-600 text-purple-100' },
  RESOLVED: { dot: 'bg-gold', label: 'Resolved', badge: 'bg-gold text-white' },
  CLOSED: { dot: 'bg-dark-500', label: 'Closed', badge: 'bg-dark-600 text-dark-300' },
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
          <p className="text-sm text-gray-300">{event_type}</p>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2.5 mb-5">
        <div className="flex items-center gap-2.5 text-sm">
          <Clock size={14} className="text-gray-400 shrink-0" />
          <span className="text-gray-300">{timeSinceOpen}</span>
        </div>

        {commander_name && (
          <div className="flex items-center gap-2.5 text-sm">
            <Users size={14} className="text-gray-400 shrink-0" />
            <span className="text-gray-300">{commander_name}</span>
          </div>
        )}

        {affected_service_ids && affected_service_ids.length > 0 && (
          <div className="flex items-center gap-2.5 text-sm">
            <Target size={14} className="text-gray-400 shrink-0" />
            <span className="text-dark-200">{affected_service_ids.length} services affected</span>
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        className={clsx(
          'w-full text-sm font-medium py-2.5 rounded-lg transition-all duration-200',
          'flex items-center justify-center gap-2',
          'border border-purple-600 hover:border-orange hover:shadow-glow',
          'text-purple-400 hover:text-orange',
          'bg-purple-600 bg-opacity-10 hover:bg-opacity-20',
          'group-hover:gap-3'
        )}
      >
        {status === 'OPEN' ? 'Open Details' : status === 'IN_PROGRESS' ? 'Continue' : 'Review'}
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}
