import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

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
  NOT_STARTED: 'bg-dark-500',
  IN_PROGRESS: 'bg-purple-500',
  COMPLETED: 'bg-gold',
  SKIPPED: 'bg-dark-600',
  BLOCKED: 'bg-red-600',
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
    <div className="bg-dark-900 bg-opacity-50 backdrop-blur border border-purple-600 border-opacity-30 rounded-lg p-8 shadow-glow">
      <div className="mb-8">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-white">Recovery Timeline</h3>
            <p className="text-sm text-gray-300 mt-1">Step-by-step visualization</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold bg-gradient-purple-orange bg-clip-text text-transparent">{completionPercent}%</div>
            <p className="text-xs text-gray-300 mt-0.5">Complete</p>
          </div>
        </div>
        <div className="w-full h-2 bg-dark-800 rounded-full overflow-hidden">
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
              <div className="flex text-xs text-white font-medium">
                {Array.from({ length: Math.ceil(totalMinutes / 30) + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="border-l border-purple-600 border-opacity-20 pl-2"
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
                  <div className="font-medium text-white">{step.name}</div>
                  <div className="text-xs text-gray-300">{STATUS_TEXT[step.status]}</div>
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
          <div className="mt-8 pt-6 border-t border-purple-600 border-opacity-20 flex flex-wrap gap-6 text-xs">
            {[
              { color: 'bg-gold', label: 'Completed' },
              { color: 'bg-purple-500', label: 'In Progress' },
              { color: 'bg-dark-500', label: 'Not Started' },
              { color: 'bg-red-600', label: 'Blocked' },
              { color: 'ring-2 ring-orange ring-inset bg-dark-800', label: 'Critical Path' },
            ].map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className={clsx('w-3 h-3 rounded-sm', item.color)} />
                <span className="text-gray-300">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
