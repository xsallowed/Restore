import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { servicesApi, eventsApi } from '../../lib/api';
import { useSSE } from '../../lib/api';
import { AlertTriangle, CheckCircle, Clock, Zap, TrendingDown, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { GanttChart } from '../../components/recovery/GanttChart';
import { TasksTable } from '../../components/recovery/TasksTable';
import { useState } from 'react';

const STATUS_CONFIG: Record<string, { color: string; dot: string; label: string }> = {
  OPERATIONAL:        { color: 'bg-green-50 text-green-800 border-green-200',   dot: 'bg-green-500', label: 'Operational' },
  DEGRADED:           { color: 'bg-yellow-50 text-yellow-800 border-yellow-200', dot: 'bg-yellow-500', label: 'Degraded' },
  PARTIALLY_IMPACTED: { color: 'bg-orange-50 text-orange-800 border-orange-200', dot: 'bg-orange-500', label: 'Partial Impact' },
  DOWN:               { color: 'bg-red-50 text-red-800 border-red-200',          dot: 'bg-red-500',    label: 'Down' },
  RECOVERING:         { color: 'bg-blue-50 text-blue-800 border-blue-200',       dot: 'bg-blue-500',   label: 'Recovering' },
  RESTORED:           { color: 'bg-green-50 text-green-700 border-green-200',    dot: 'bg-green-400',  label: 'Restored' },
};

const SEVERITY_COLOR: Record<string, string> = {
  P1: 'bg-red-100 text-red-800',
  P2: 'bg-orange-100 text-orange-800',
  P3: 'bg-yellow-100 text-yellow-800',
  P4: 'bg-gray-100 text-gray-700',
};

export function OrchestratorDashboard() {
  useSSE(); // Subscribe to all health and step events
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tasks, setTasks] = useState<any[]>([]);

  const { data: servicesData } = useQuery({
    queryKey: ['business-services'],
    queryFn: () => servicesApi.list().then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const { data: eventsData } = useQuery({
    queryKey: ['events', 'active'],
    queryFn: () => eventsApi.list({ status: 'IN_PROGRESS' }).then(r => r.data.data),
    refetchInterval: 15_000,
  });

  const { data: soeData } = useQuery({
    queryKey: ['soe', eventsData?.[0]?.id],
    queryFn: () => eventsData?.[0] ? eventsApi.getSoe(eventsData[0].id as string).then(r => r.data.data) : null,
    enabled: !!eventsData?.[0]?.id,
    refetchInterval: 15_000,
  });

  const services: Record<string, unknown>[] = servicesData ?? [];
  const activeEvents: Record<string, unknown>[] = eventsData ?? [];
  const soeSteps = soeData?.steps ?? [];

  const downCount = services.filter(s => s.status === 'DOWN').length;
  const degradedCount = services.filter(s => ['DEGRADED', 'PARTIALLY_IMPACTED'].includes(s.status as string)).length;
  const healthyCount = services.filter(s => s.status === 'OPERATIONAL').length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orchestration Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Real-time recovery intelligence — Silver tier</p>
        </div>
        <button
          onClick={() => navigate('/events/new')}
          className="flex items-center gap-2 bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Zap size={15} />
          Open Recovery Event
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Events', value: activeEvents.length, icon: AlertTriangle, color: activeEvents.length > 0 ? 'text-red-500' : 'text-gray-400' },
          { label: 'Services Down', value: downCount, icon: TrendingDown, color: downCount > 0 ? 'text-red-500' : 'text-gray-400' },
          { label: 'Degraded', value: degradedCount, icon: Activity, color: degradedCount > 0 ? 'text-orange-500' : 'text-gray-400' },
          { label: 'Operational', value: healthyCount, icon: CheckCircle, color: 'text-green-500' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <stat.icon size={20} className={stat.color} />
            <div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Active incident banner */}
      {activeEvents.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Active Events</h2>
          {activeEvents.map(event => (
            <div
              key={event.id as string}
              onClick={() => navigate(`/events/${event.id}`)}
              className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:bg-red-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle size={18} className="text-red-500 shrink-0" />
                <div>
                  <span className={clsx('text-xs font-bold px-2 py-0.5 rounded mr-2', SEVERITY_COLOR[event.severity as string])}>
                    {event.severity as string}
                  </span>
                  <span className="font-medium text-gray-900">{event.title as string}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Clock size={13} />
                {formatDistanceToNow(new Date(event.opened_at as string), { addSuffix: true })}
                <span className="text-brand-600 font-medium ml-2">View →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recovery Timeline & Tasks - shown when event is active */}
      {activeEvents.length > 0 && soeData && (
        <div className="space-y-6">
          <GanttChart
            steps={soeSteps}
            totalMinutes={soeData.total_estimated_minutes || 180}
          />
          <TasksTable
            tasks={soeSteps.map((step: any, idx: number) => ({
              id: step.id,
              sequence: step.sequence,
              name: step.name,
              description: step.description,
              assigned_to: step.assigned_to,
              assignee_name: step.assignee_name,
              status: step.status,
              started_at: step.started_at,
              completed_at: step.completed_at,
              dependencies: step.dependencies || [],
              is_on_critical_path: step.is_on_critical_path,
            }))}
            onAddTask={(newTask) => {
              const task = {
                id: 'task-' + Date.now(),
                ...newTask,
              };
              setTasks([...tasks, task]);
            }}
            onDeleteTask={(taskId) => {
              setTasks(tasks.filter(t => t.id !== taskId));
            }}
          />
        </div>
      )}

      {/* Business Service Health Panel */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Business Service Health</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {services.map(service => {
            const cfg = STATUS_CONFIG[service.status as string] ?? STATUS_CONFIG.OPERATIONAL;
            return (
              <div
                key={service.id as string}
                className={clsx('rounded-xl border p-4 flex items-start justify-between', cfg.color)}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={clsx('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                    <span className="font-medium text-sm">{service.name as string}</span>
                  </div>
                  <p className="text-xs opacity-70">{service.business_unit as string}</p>
                  <p className="text-xs opacity-70 mt-0.5">RTO: {service.rto_minutes as number} min</p>
                </div>
                <span className="text-xs font-semibold shrink-0 ml-2">{cfg.label}</span>
              </div>
            );
          })}

          {services.length === 0 && (
            <div className="col-span-3 bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
              No business services configured — add assets and services in the Asset Registry.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
