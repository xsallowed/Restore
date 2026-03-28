import clsx from 'clsx';
import { AlertTriangle, Clock } from 'lucide-react';
import { themeClasses } from '../../lib/themeClasses';

interface IncidentHeaderProps {
  eventTitle: string;
  eventType: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  opened_at: string;
  stepsCompleted: number;
  stepsTotal: number;
  stepsInProgress: number;
  affectedServices: number;
}

const SEVERITY_CONFIG = {
  P1: { bg: 'bg-red-600 dark:bg-red-600', text: 'text-white', label: 'Critical' },
  P2: { bg: 'bg-orange dark:bg-orange', text: 'text-white', label: 'High' },
  P3: { bg: 'bg-yellow-500 dark:bg-yellow-500', text: 'text-white dark:text-gray-900', label: 'Medium' },
  P4: { bg: 'bg-purple-600 dark:bg-purple-600', text: 'text-white', label: 'Low' },
};

export function IncidentHeader({
  eventTitle,
  eventType,
  severity,
  opened_at,
  stepsCompleted,
  stepsTotal,
  stepsInProgress,
  affectedServices,
}: IncidentHeaderProps) {
  const severityConfig = SEVERITY_CONFIG[severity];
  const timeElapsed = Math.floor((Date.now() - new Date(opened_at).getTime()) / (1000 * 60));
  const hours = Math.floor(timeElapsed / 60);
  const minutes = timeElapsed % 60;

  return (
    <div className={clsx(themeClasses.card, 'border-gray-300 dark:border-gray-700 rounded-lg p-6 shadow-sm dark:shadow-md mb-6')}>
      {/* Header Row */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <h1 className={clsx(themeClasses.text.primary, 'text-3xl font-bold')}>{eventTitle}</h1>
          <p className={clsx(themeClasses.text.secondary, 'text-sm mt-2')}>{eventType}</p>
        </div>
        <div className={clsx(severityConfig.bg, severityConfig.text, 'px-4 py-2 rounded-lg font-bold text-lg whitespace-nowrap ml-4')}>
          {severity} - {severityConfig.label}
        </div>
      </div>

      {/* Key Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Time Elapsed */}
        <div className={clsx(themeClasses.bg.tertiary, 'p-3 rounded-lg')}>
          <div className="flex items-center gap-2 mb-1">
            <Clock size={16} className={themeClasses.text.secondary} />
            <p className={clsx(themeClasses.text.tertiary, 'text-xs font-semibold')}>ELAPSED</p>
          </div>
          <p className={clsx(themeClasses.text.primary, 'text-lg font-bold')}>{hours}h {minutes}m</p>
        </div>

        {/* Recovery Progress */}
        <div className={clsx(themeClasses.bg.tertiary, 'p-3 rounded-lg')}>
          <p className={clsx(themeClasses.text.tertiary, 'text-xs font-semibold mb-1')}>PROGRESS</p>
          <div className="space-y-1">
            <p className={clsx(themeClasses.text.primary, 'text-lg font-bold')}>{stepsCompleted}/{stepsTotal}</p>
            <p className={clsx(themeClasses.text.tertiary, 'text-xs')}>completed</p>
          </div>
        </div>

        {/* In Progress */}
        <div className={clsx(themeClasses.bg.tertiary, 'p-3 rounded-lg')}>
          <p className={clsx(themeClasses.text.tertiary, 'text-xs font-semibold mb-1')}>IN PROGRESS</p>
          <p className={clsx(themeClasses.text.primary, 'text-lg font-bold')}>{stepsInProgress}</p>
        </div>

        {/* Affected Services */}
        <div className={clsx(themeClasses.bg.tertiary, 'p-3 rounded-lg')}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className="text-red-500 dark:text-red-400" />
            <p className={clsx(themeClasses.text.tertiary, 'text-xs font-semibold')}>AFFECTED</p>
          </div>
          <p className={clsx(themeClasses.text.primary, 'text-lg font-bold')}>{affectedServices}</p>
        </div>

        {/* Opened At */}
        <div className={clsx(themeClasses.bg.tertiary, 'p-3 rounded-lg col-span-2 sm:col-span-1')}>
          <p className={clsx(themeClasses.text.tertiary, 'text-xs font-semibold mb-1')}>OPENED AT</p>
          <p className={clsx(themeClasses.text.secondary, 'text-xs')}>{new Date(opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
    </div>
  );
}
