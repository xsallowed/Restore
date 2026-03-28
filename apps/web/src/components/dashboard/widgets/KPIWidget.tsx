import { Zap, CheckCircle, Activity, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { themeClasses } from '../../../lib/themeClasses';

interface KPIWidgetProps {
  ttfrMinutes?: number;
  ttfrConfidenceLow?: number;
  ttfrConfidenceHigh?: number;
  recoveryConfidenceScore?: number;
  stepsCompleted: number;
  stepsTotal: number;
  stepsInProgress: number;
  affectedServices: number;
}

export function KPIWidget({
  ttfrMinutes,
  ttfrConfidenceLow,
  ttfrConfidenceHigh,
  recoveryConfidenceScore,
  stepsCompleted,
  stepsTotal,
  stepsInProgress,
  affectedServices,
}: KPIWidgetProps) {
  const kpis = [
    {
      title: 'TIME TO FIRST RECOVERY',
      value: ttfrMinutes || 'N/A',
      unit: 'min',
      detail: ttfrConfidenceLow ? `Range: ${ttfrConfidenceLow}-${ttfrConfidenceHigh} min` : undefined,
      icon: Zap,
      color: 'text-purple-600 dark:text-purple-400',
    },
    {
      title: 'RECOVERY CONFIDENCE',
      value: recoveryConfidenceScore ? Math.round(recoveryConfidenceScore * 100) : 'N/A',
      unit: '%',
      detail: 'ML-powered prediction',
      icon: CheckCircle,
      color: 'text-yellow-600 dark:text-yellow-400',
    },
    {
      title: 'TASKS COMPLETED',
      value: `${stepsCompleted}/${stepsTotal}`,
      unit: 'steps',
      detail: 'Recovery sequence',
      icon: Activity,
      color: 'text-orange',
    },
    {
      title: 'ACTIVE TASKS',
      value: stepsInProgress,
      unit: 'running',
      detail: 'in progress',
      icon: AlertCircle,
      color: 'text-pink-600 dark:text-pink-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3">
      {kpis.map((kpi, idx) => (
        <div key={idx} className={clsx(themeClasses.bg.tertiary, 'p-4 rounded-lg')}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className={clsx(themeClasses.text.secondary, 'text-xs font-semibold uppercase tracking-wider mb-2')}>
                {kpi.title}
              </p>
              <p className={clsx(themeClasses.text.primary, 'text-2xl font-bold')}>{kpi.value}</p>
              {kpi.detail && <p className={clsx(themeClasses.text.tertiary, 'text-xs mt-1')}>{kpi.detail}</p>}
            </div>
            <kpi.icon size={20} className={clsx('shrink-0 ml-2', kpi.color)} />
          </div>
        </div>
      ))}
    </div>
  );
}
