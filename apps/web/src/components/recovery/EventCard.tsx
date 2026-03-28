import { AlertTriangle, Clock, Users, Target } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
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
  P1: { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-800', label: 'Critical' },
  P2: { bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-800', label: 'High' },
  P3: { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-800', label: 'Medium' },
  P4: { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-800', label: 'Low' },
};

const STATUS_CONFIG = {
  OPEN: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500', label: 'Open' },
  IN_PROGRESS: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500', label: 'Active' },
  RESOLVED: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500', label: 'Resolved' },
  CLOSED: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', dot: 'bg-gray-500', label: 'Closed' },
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
        'rounded-2xl border-2 p-6 cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105',
        statusCfg.bg,
        statusCfg.border
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div className={clsx('w-3 h-3 rounded-full shrink-0', statusCfg.dot)} />
            <span className={clsx('text-xs font-bold px-2 py-1 rounded', severityCfg.bg, severityCfg.text)}>
              {severity} — {severityCfg.label}
            </span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">{title}</h3>
          <p className="text-sm text-gray-600">{event_type}</p>
        </div>
        <AlertTriangle size={24} className={clsx('shrink-0 ml-2', statusCfg.text)} />
      </div>

      {/* Status Badge */}
      <div className="mb-4">
        <span className={clsx('inline-block text-xs font-semibold px-3 py-1.5 rounded-full', statusCfg.bg, statusCfg.text)}>
          {statusCfg.label}
        </span>
      </div>

      {/* Details Grid */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2 text-sm">
          <Clock size={16} className="text-gray-600 shrink-0" />
          <span className="text-gray-700">
            <span className="font-medium">Opened:</span> {timeSinceOpen}
          </span>
        </div>

        {commander_name && (
          <div className="flex items-center gap-2 text-sm">
            <Users size={16} className="text-gray-600 shrink-0" />
            <span className="text-gray-700">
              <span className="font-medium">Commander:</span> {commander_name}
            </span>
          </div>
        )}

        {affected_service_ids && affected_service_ids.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <Target size={16} className="text-gray-600 shrink-0" />
            <span className="text-gray-700">
              <span className="font-medium">{affected_service_ids.length}</span> services affected
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-4 border-t border-gray-200 border-opacity-40">
        <button
          className={clsx(
            'w-full text-sm font-semibold py-2 rounded-lg transition-colors',
            status === 'IN_PROGRESS'
              ? 'bg-blue-500 hover:bg-blue-600 text-white'
              : status === 'OPEN'
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-gray-400 hover:bg-gray-500 text-white'
          )}
        >
          {status === 'OPEN' ? 'Activate' : status === 'IN_PROGRESS' ? 'View' : 'Review'} →
        </button>
      </div>
    </div>
  );
}
