import { AlertTriangle, Clock, Users, Target, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { themeClasses } from '../../lib/themeClasses';

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
  P1: { border: 'border-red-500 dark:border-red-600', badge: 'bg-red-600 dark:bg-red-700 text-red-50', text: 'text-red-600 dark:text-red-400', label: 'Critical', icon: '🔴' },
  P2: { border: 'border-orange dark:border-orange', badge: 'bg-orange dark:bg-orange text-white', text: 'text-orange', label: 'High', icon: '🟠' },
  P3: { border: 'border-yellow-400 dark:border-yellow-600', badge: 'bg-yellow-500 dark:bg-yellow-600 text-white dark:text-gray-900', text: 'text-yellow-600 dark:text-yellow-400', label: 'Medium', icon: '🟡' },
  P4: { border: 'border-purple-600 dark:border-purple-600', badge: 'bg-purple-600 dark:bg-purple-700 text-purple-50', text: 'text-purple-600 dark:text-purple-400', label: 'Low', icon: '⚪' },
};

const STATUS_CONFIG = {
  OPEN: { dot: 'bg-red-600 dark:bg-red-500', label: 'Open', badge: 'bg-red-600 dark:bg-red-700 text-red-50' },
  IN_PROGRESS: { dot: 'bg-purple-600 dark:bg-purple-500', label: 'Active', badge: 'bg-purple-600 dark:bg-purple-700 text-purple-50' },
  RESOLVED: { dot: 'bg-yellow-500 dark:bg-yellow-500', label: 'Resolved', badge: 'bg-yellow-500 dark:bg-yellow-600 text-white dark:text-gray-900' },
  CLOSED: { dot: 'bg-gray-400 dark:bg-gray-600', label: 'Closed', badge: 'bg-gray-400 dark:bg-gray-700 text-gray-800 dark:text-gray-200' },
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
        'hover:shadow-lg dark:hover:shadow-glow hover:border-opacity-100 hover:-translate-y-0.5',
        themeClasses.card,
        severityCfg.border,
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
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1.5">{title}</h3>
          <p className={clsx(themeClasses.text.secondary, 'text-sm')}>{event_type}</p>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2.5 mb-5">
        <div className="flex items-center gap-2.5 text-sm">
          <Clock size={14} className="text-gray-600 dark:text-white shrink-0" />
          <span className={themeClasses.text.secondary}>{timeSinceOpen}</span>
        </div>

        {commander_name && (
          <div className="flex items-center gap-2.5 text-sm">
            <Users size={14} className="text-gray-600 dark:text-white shrink-0" />
            <span className={themeClasses.text.secondary}>{commander_name}</span>
          </div>
        )}

        {affected_service_ids && affected_service_ids.length > 0 && (
          <div className="flex items-center gap-2.5 text-sm">
            <Target size={14} className="text-gray-600 dark:text-white shrink-0" />
            <span className={themeClasses.text.secondary}>{affected_service_ids.length} services affected</span>
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        className={clsx(
          'w-full text-sm font-medium py-2.5 rounded-lg transition-all duration-200',
          'flex items-center justify-center gap-2',
          'border border-purple-600 dark:border-purple-600 hover:border-orange dark:hover:border-orange hover:shadow-lg dark:hover:shadow-glow',
          'text-purple-600 dark:text-purple-400 hover:text-orange',
          'bg-purple-100 dark:bg-purple-600 dark:bg-opacity-10 hover:bg-purple-200 dark:hover:bg-opacity-20',
          'group-hover:gap-3'
        )}
      >
        {status === 'OPEN' ? 'Open Details' : status === 'IN_PROGRESS' ? 'Continue' : 'Review'}
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}
