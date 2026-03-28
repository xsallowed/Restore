import { formatDistanceToNow } from 'date-fns';

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
  NOT_STARTED: 'bg-gray-300',
  IN_PROGRESS: 'bg-blue-500',
  COMPLETED: 'bg-green-500',
  SKIPPED: 'bg-gray-400',
  BLOCKED: 'bg-red-500',
};

const STATUS_TEXT = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  SKIPPED: 'Skipped',
  BLOCKED: 'Blocked',
};

export function GanttChart({ steps, totalMinutes }: GanttChartProps) {
  const chartWidth = Math.max(totalMinutes * 4, 800); // 4px per minute
  const pixelsPerMinute = chartWidth / totalMinutes;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Recovery Timeline</h3>
      
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Timeline ruler */}
          <div className="flex mb-2">
            <div className="w-48 shrink-0" />
            <div className="relative" style={{ width: chartWidth }}>
              <div className="flex text-xs text-gray-500">
                {Array.from({ length: Math.ceil(totalMinutes / 30) + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="border-l border-gray-300 pl-2"
                    style={{ width: `${30 * pixelsPerMinute}px` }}
                  >
                    {i * 30}min
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Steps */}
          {steps.map((step) => {
            const startMin = step.ganttStartMinute || 0;
            const endMin = step.ganttEndMinute || startMin + step.estimated_duration_minutes;
            const leftPercent = (startMin / totalMinutes) * 100;
            const widthPercent = ((endMin - startMin) / totalMinutes) * 100;

            return (
              <div key={step.id} className="flex mb-3 items-center">
                <div className="w-48 shrink-0 text-sm truncate pr-3">
                  <div className="font-medium text-gray-900">{step.name}</div>
                  <div className="text-xs text-gray-500">{STATUS_TEXT[step.status]}</div>
                </div>
                
                <div className="relative flex-1" style={{ height: 40 }}>
                  <div
                    className={`absolute h-full rounded flex items-center justify-center text-xs font-medium text-white transition-all cursor-default ${
                      STATUS_COLOR[step.status]
                    } ${step.is_on_critical_path ? 'ring-2 ring-orange-300' : ''}`}
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
          <div className="mt-6 pt-4 border-t border-gray-200 flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded" />
              <span className="text-gray-600">Completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded" />
              <span className="text-gray-600">In Progress</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-300 rounded" />
              <span className="text-gray-600">Not Started</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-red-500 rounded" />
              <span className="text-gray-600">Blocked</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-orange-300 rounded" />
              <span className="text-gray-600">Critical Path</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
