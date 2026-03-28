import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { themeClasses } from '../../lib/themeClasses';

interface GanttStep {
  id: string;
  name: string;
  sequence: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'BLOCKED';
  started_at: string | null;
  completed_at: string | null;
  estimated_duration_minutes: number;
  ganttStartMinute?: number;
  ganttEndMinute?: number;
  is_on_critical_path: boolean;
}

interface GanttChartProps {
  steps: GanttStep[];
  totalMinutes: number;
}

const STATUS_COLOR = {
  NOT_STARTED: 'bg-gray-300 dark:bg-gray-700',
  IN_PROGRESS: 'bg-purple-500 dark:bg-purple-600',
  COMPLETED: 'bg-yellow-500 dark:bg-yellow-500',
  SKIPPED: 'bg-gray-400 dark:bg-gray-600',
  BLOCKED: 'bg-red-600 dark:bg-red-600',
};

const STATUS_TEXT = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  SKIPPED: 'Skipped',
  BLOCKED: 'Blocked',
};

export function GanttChart({ steps, totalMinutes }: GanttChartProps) {
  const chartWidth = Math.max(totalMinutes * 5, 900);
  const pixelsPerMinute = chartWidth / totalMinutes;
  const completedSteps = steps.filter(s => s.status === 'COMPLETED').length;
  const completionPercent = Math.round((completedSteps / steps.length) * 100);

  return (
    <div className={clsx(themeClasses.card, 'border-purple-200 dark:border-purple-700 rounded-lg p-8 shadow-sm dark:shadow-glow')}>
      <div className="mb-8">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recovery Timeline</h3>
            <p className={clsx(themeClasses.text.secondary, 'text-sm mt-1')}>Step-by-step visualization</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold bg-gradient-purple-orange bg-clip-text text-transparent">{completionPercent}%</div>
            <p className={clsx(themeClasses.text.secondary, 'text-xs mt-0.5')}>Complete</p>
          </div>
        </div>
        <div className={clsx(themeClasses.bg.tertiary, 'w-full h-2 rounded-full overflow-hidden')}>
          <div
            className="h-full bg-gradient-purple-orange transition-all duration-500 rounded-full"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Timeline ruler */}
          <div className="flex mb-4">
            <div className="w-40 shrink-0" />
            <div className="relative" style={{ width: chartWidth }}>
              <div className="flex text-xs text-gray-900 dark:text-white font-medium">
                {Array.from({ length: Math.ceil(totalMinutes / 30) + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="border-l border-purple-300 dark:border-purple-700 pl-2"
                    style={{ width: `${30 * pixelsPerMinute}px` }}
                  >
                    {i * 30}m
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Steps */}
          {steps.map((step, idx) => {
            const startMin = step.ganttStartMinute || 0;
            const endMin = step.ganttEndMinute || startMin + step.estimated_duration_minutes;
            const leftPercent = (startMin / totalMinutes) * 100;
            const widthPercent = ((endMin - startMin) / totalMinutes) * 100;

            return (
              <div key={step.id} className="flex mb-2.5 items-center group">
                <div className="w-40 shrink-0 text-sm truncate pr-3">
                  <div className="font-medium text-gray-900 dark:text-white">{step.name}</div>
                  <div className={clsx(themeClasses.text.tertiary, 'text-xs')}>{STATUS_TEXT[step.status]}</div>
                </div>

                <div className="relative flex-1" style={{ height: 36 }}>
                  <div
                    className={`absolute h-full rounded-md flex items-center justify-center text-xs font-medium text-dark-950 transition-all cursor-default shadow-sm group-hover:shadow-glow ${
                      STATUS_COLOR[step.status]
                    } ${step.is_on_critical_path ? 'ring-2 ring-orange ring-inset' : ''}`}
                    style={{
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`,
                      minWidth: '60px',
                    }}
                    title={`${step.name}: ${Math.round(endMin - startMin)}min`}
                  >
                    {Math.round(endMin - startMin)}m
                  </div>
                </div>
              </div>
            );
          })}

          {/* Legend */}
          <div className={clsx('mt-8 pt-6 border-t border-purple-300 dark:border-purple-700 flex flex-wrap gap-6 text-xs')}>
            {[
              { color: 'bg-yellow-500', label: 'Completed' },
              { color: 'bg-purple-500', label: 'In Progress' },
              { color: 'bg-gray-300 dark:bg-gray-700', label: 'Not Started' },
              { color: 'bg-red-600', label: 'Blocked' },
              { color: 'ring-2 ring-orange ring-inset bg-gray-300 dark:bg-gray-700', label: 'Critical Path' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className={clsx('w-3 h-3 rounded-sm', item.color)} />
                <span className={themeClasses.text.secondary}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
