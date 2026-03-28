import { useQuery } from '@tanstack/react-query';
import { eventsApi } from '../../lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { Clock, TrendingUp, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

interface GanttStep {
  id: string;
  name: string;
  status: string;
  swim_lane: string;
  is_on_critical_path: boolean;
  phase_name: string;
  ganttStartMinute: number;
  ganttEndMinute: number;
  duration: number;
  assignee_name?: string;
}

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: '#e5e7eb',
  IN_PROGRESS: '#3b82f6',
  COMPLETED:   '#22c55e',
  BLOCKED:     '#ef4444',
  SKIPPED:     '#f59e0b',
};

const CRITICAL_PATH_COLOR = '#dc2626';
const NORMAL_COLOR = '#60a5fa';

export function GanttChart({ eventId }: { eventId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['gantt', eventId],
    queryFn: () => eventsApi.getGantt(eventId).then(r => r.data.data),
    refetchInterval: 15_000,
  });

  const { data: ttfrData } = useQuery<{
    ttfrMinutes: number;
    confidenceLow: number;
    confidenceHigh: number;
    recoveryConfidenceScore: number;
    completionPercentage: number;
  }>({
    queryKey: ['ttfr', eventId],
  });

  const steps: GanttStep[] = data?.gantt ?? [];

  if (isLoading) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-white">
        Loading Gantt chart…
      </div>
    );
  }

  if (!steps.length) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-white">
        SOE not yet generated
      </div>
    );
  }

  // Group by swim lane for parallel track display
  const lanes = [...new Set(steps.map(s => s.swim_lane || 'General'))];
  const maxEnd = Math.max(...steps.map(s => s.ganttEndMinute));

  // Build flat chart data — one bar range per step
  const chartData = steps.map(step => ({
    name: step.name.length > 30 ? step.name.slice(0, 28) + '…' : step.name,
    lane: step.swim_lane || 'General',
    start: step.ganttStartMinute,
    duration: step.duration,
    end: step.ganttEndMinute,
    status: step.status,
    isCritical: step.is_on_critical_path,
    id: step.id,
  }));

  const now_minutes = ttfrData ? maxEnd - (ttfrData.ttfrMinutes ?? 0) : null;

  return (
    <div>
      {/* TTFR header */}
      <div className="flex items-stretch border-b border-gray-700">
        <div className="flex-1 px-4 py-3 flex items-center gap-6 flex-wrap">
          <div>
            <p className="text-xs text-white uppercase tracking-wide">TTFR Estimate</p>
            <p className="text-lg font-bold text-white">
              {ttfrData?.ttfrMinutes ? `${Math.round(ttfrData.ttfrMinutes / 60 * 10) / 10}h` : '–'}
            </p>
            {ttfrData?.confidenceLow && (
              <p className="text-xs text-white">
                {Math.round(ttfrData.confidenceLow / 60 * 10) / 10}h – {Math.round(ttfrData.confidenceHigh / 60 * 10) / 10}h range
              </p>
            )}
          </div>

          <div>
            <p className="text-xs text-white uppercase tracking-wide">Confidence</p>
            <div className="flex items-center gap-2">
              <div className="w-20 h-2 bg-gray-600 rounded-full overflow-hidden">
                <div
                  className={clsx('h-full rounded-full transition-all', {
                    'bg-green-500': (ttfrData?.recoveryConfidenceScore ?? 0) >= 0.7,
                    'bg-yellow-500': (ttfrData?.recoveryConfidenceScore ?? 0) >= 0.4 && (ttfrData?.recoveryConfidenceScore ?? 0) < 0.7,
                    'bg-red-600': (ttfrData?.recoveryConfidenceScore ?? 0) < 0.4,
                  })}
                  style={{ width: `${Math.round((ttfrData?.recoveryConfidenceScore ?? 0) * 100)}%` }}
                />
              </div>
              <span className="text-sm font-bold">
                {Math.round((ttfrData?.recoveryConfidenceScore ?? 0) * 100)}%
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs text-white uppercase tracking-wide">Progress</p>
            <p className="text-lg font-bold text-white">{ttfrData?.completionPercentage ?? 0}%</p>
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 py-3 flex items-center gap-4 text-xs text-gray-300 border-l border-gray-700">
          {[
            { color: '#22c55e', label: 'Complete' },
            { color: '#3b82f6', label: 'In Progress' },
            { color: '#ef4444', label: 'Blocked' },
            { color: '#e5e7eb', label: 'Pending' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: l.color }} />
              {l.label}
            </div>
          ))}
          <div className="flex items-center gap-1">
            <AlertCircle size={11} className="text-red-500" />
            Critical path
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="px-4 py-4">
        <ResponsiveContainer width="100%" height={Math.max(200, steps.length * 28)}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 0, right: 40, bottom: 0, left: 140 }}
          >
            <XAxis
              type="number"
              domain={[0, maxEnd + 15]}
              tickFormatter={v => `${Math.round(v / 60 * 10) / 10}h`}
              tick={{ fontSize: 10 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={135}
              tick={{ fontSize: 10 }}
            />
            <Tooltip
              formatter={(value: unknown, name: string, props: { payload?: Record<string, unknown> }) => {
                if (name === 'start') return [null, null];
                const step = props.payload;
                return [`${step?.duration as number} min`, 'Duration'];
              }}
              labelFormatter={(label: string) => label}
            />
            {/* Invisible bar for offset (start position) */}
            <Bar dataKey="start" fill="transparent" stackId="gantt" />
            {/* Duration bar */}
            <Bar dataKey="duration" stackId="gantt" radius={[2, 2, 2, 2]}>
              {chartData.map(entry => (
                <Cell
                  key={entry.id}
                  fill={entry.isCritical ? CRITICAL_PATH_COLOR : STATUS_COLORS[entry.status] ?? NORMAL_COLOR}
                  opacity={entry.status === 'SKIPPED' ? 0.5 : 1}
                />
              ))}
            </Bar>
            {/* Now marker */}
            {now_minutes !== null && (
              <ReferenceLine
                x={now_minutes}
                stroke="#f97316"
                strokeDasharray="4 2"
                label={{ value: 'Now', position: 'top', fontSize: 10, fill: '#f97316' }}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Swim lane summary */}
      <div className="px-4 pb-3 flex gap-2 flex-wrap border-t border-gray-700 pt-2">
        {lanes.map(lane => {
          const laneSteps = steps.filter(s => (s.swim_lane || 'General') === lane);
          const laneCompleted = laneSteps.filter(s => s.status === 'COMPLETED').length;
          return (
            <div key={lane} className="text-xs bg-dark-800 border border-gray-600 rounded px-2 py-1">
              <span className="font-medium">{lane}</span>
              <span className="text-white ml-1">{laneCompleted}/{laneSteps.length}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
