import clsx from 'clsx';
import { themeClasses } from '../../../lib/themeClasses';

interface IncidentOverviewWidgetProps {
  eventTitle: string;
  eventType: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  opened_at: string;
}

const SEVERITY_CONFIG = {
  P1: { color: 'bg-red-900/40 text-red-200', label: 'Critical' },
  P2: { color: 'bg-orange-900/40 text-orange-200', label: 'High' },
  P3: { color: 'bg-yellow-900/40 text-yellow-200', label: 'Medium' },
  P4: { color: 'bg-purple-900/40 text-purple-200', label: 'Low' },
};

export function IncidentOverviewWidget({ eventTitle, eventType, severity, opened_at }: IncidentOverviewWidgetProps) {
  const severityConfig = SEVERITY_CONFIG[severity];
  const timeElapsed = Math.floor((Date.now() - new Date(opened_at).getTime()) / (1000 * 60));
  const hours = Math.floor(timeElapsed / 60);
  const minutes = timeElapsed % 60;

  return (
    <div className="space-y-4">
      <div>
        <h1 className={clsx(themeClasses.text.primary, 'text-2xl font-bold')}>{eventTitle}</h1>
        <p className={clsx(themeClasses.text.secondary, 'text-sm mt-1')}>{eventType}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className={clsx(severityConfig.color, 'px-3 py-1.5 rounded-full text-sm font-semibold')}>
          {severity} - {severityConfig.label}
        </div>
        <div className={clsx(themeClasses.text.secondary, 'text-sm')}>
          {hours}h {minutes}m elapsed
        </div>
      </div>

      <div className={clsx(themeClasses.bg.tertiary, 'p-3 rounded-lg')}>
        <p className={clsx(themeClasses.text.secondary, 'text-xs')}>
          Opened at {new Date(opened_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
