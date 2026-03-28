import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { servicesApi, eventsApi } from '../../lib/api';
import { useSSE } from '../../lib/api';
import { AlertTriangle, CheckCircle, Clock, Zap, TrendingDown, Activity, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { GanttChart } from '../../components/recovery/GanttChart';
import { TasksTable } from '../../components/recovery/TasksTable';
import { IncidentDashboard } from '../../components/recovery/IncidentDashboard';
import { EventCard } from '../../components/recovery/EventCard';
import { EventDetailsModal } from '../../components/recovery/EventDetailsModal';
import { NewEventDialog } from '../../components/recovery/NewEventDialog';
import { useState } from 'react';
import { Buttons, Typography, Cards, Badges } from '../../lib/styleConstants';

const STATUS_CONFIG: Record<string, { color: string; dot: string; label: string }> = {
  OPERATIONAL:        { color: 'bg-gray-800 bg-opacity-30 text-gray-300 border border-gold border-opacity-30',   dot: 'bg-gold', label: 'Operational' },
  DEGRADED:           { color: 'bg-gray-800 bg-opacity-30 text-gray-300 border border-orange border-opacity-30', dot: 'bg-orange', label: 'Degraded' },
  PARTIALLY_IMPACTED: { color: 'bg-gray-800 bg-opacity-30 text-gray-300 border border-orange border-opacity-30', dot: 'bg-orange', label: 'Partial Impact' },
  DOWN:               { color: 'bg-gray-800 bg-opacity-30 text-gray-300 border border-red-500 border-opacity-30',      dot: 'bg-red-600',    label: 'Down' },
  RECOVERING:         { color: 'bg-gray-800 bg-opacity-30 text-gray-300 border border-purple-600 border-opacity-30',       dot: 'bg-purple-600',   label: 'Recovering' },
  RESTORED:           { color: 'bg-gray-800 bg-opacity-30 text-gray-300 border border-gold border-opacity-30',    dot: 'bg-gold',  label: 'Restored' },
};

const SEVERITY_COLOR: Record<string, string> = {
  P1: 'bg-red-600 text-white',
  P2: 'bg-orange text-white',
  P3: 'bg-gold text-white',
  P4: 'bg-purple-600 text-white',
};

export function OrchestratorDashboard() {
  useSSE(); // Subscribe to all health and step events
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [showEventDetailsModal, setShowEventDetailsModal] = useState(false);
  const [showNewEventDialog, setShowNewEventDialog] = useState(false);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);

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
          <div className="mb-3">
            <span className={Badges.purpleOutline}>Crisis Response Platform</span>
          </div>
          <h1 className={Typography.sectionHeading}>Incident Recovery Center</h1>
          <p className={Typography.bodyText + ' mt-2'}>Manage and orchestrate cyber incident responses with AI-powered insights</p>
        </div>
        <button
          onClick={() => setShowNewEventDialog(true)}
          className={Buttons.primary}
        >
          <Plus size={18} />
          Create Incident
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Events', value: activeEvents.length, icon: AlertTriangle, color: activeEvents.length > 0 ? 'text-red-500' : 'text-gray-500' },
          { label: 'Services Down', value: downCount, icon: TrendingDown, color: downCount > 0 ? 'text-red-500' : 'text-gray-500' },
          { label: 'Degraded', value: degradedCount, icon: Activity, color: degradedCount > 0 ? 'text-orange' : 'text-gray-500' },
          { label: 'Operational', value: healthyCount, icon: CheckCircle, color: 'text-gold' },
        ].map(stat => (
          <div key={stat.label} className={Cards.base + ' p-4'}>
            <stat.icon size={20} className={stat.color} />
            <div>
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-gray-300">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Show Incident Dashboard when event is activated */}
      {activeEventId && activeEvents.find(e => e.id === activeEventId) && soeData && (
        <>
          <IncidentDashboard
            metrics={{
              eventTitle: activeEvents.find(e => e.id === activeEventId)?.title || 'Unknown',
              eventType: activeEvents.find(e => e.id === activeEventId)?.event_type || '',
              severity: activeEvents.find(e => e.id === activeEventId)?.severity || 'P1',
              status: 'Active',
              opened_at: activeEvents.find(e => e.id === activeEventId)?.opened_at || new Date().toISOString(),
              total_estimated_minutes: soeData.total_estimated_minutes || 180,
              ml_ttfr_minutes: soeData.ml_ttfr_minutes,
              ml_ttfr_confidence_low: soeData.ml_ttfr_confidence_low,
              ml_ttfr_confidence_high: soeData.ml_ttfr_confidence_high,
              recovery_confidence_score: soeData.recovery_confidence_score,
              steps_total: soeSteps.length,
              steps_completed: soeSteps.filter((s: any) => s.status === 'COMPLETED').length,
              steps_in_progress: soeSteps.filter((s: any) => s.status === 'IN_PROGRESS').length,
              affected_services: activeEvents.find(e => e.id === activeEventId)?.affected_service_ids?.length || 0,
            }}
          />

          <GanttChart
            steps={soeSteps}
            totalMinutes={soeData.total_estimated_minutes || 180}
          />

          <TasksTable
            tasks={soeSteps.map((step: any) => ({
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

          <button
            onClick={() => setActiveEventId(null)}
            className={Buttons.secondary + ' w-full'}
          >
            Back to Events List
          </button>
        </>
      )}

      {/* Events Grid - Show when no event is active */}
      {!activeEventId && (
        <div>
          <h2 className={Typography.subsectionHeading + ' mb-4'}>
            {activeEvents.length > 0 ? 'Active Incidents' : 'No Active Incidents'}
          </h2>
          {activeEvents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeEvents.map(event => (
                <EventCard
                  key={event.id as string}
                  id={event.id as string}
                  title={event.title as string}
                  event_type={event.event_type as string}
                  severity={event.severity as any}
                  status={event.status as any}
                  opened_at={event.opened_at as string}
                  commander_name={event.commander_name as string}
                  onClick={() => {
                    setSelectedEvent(event);
                    setShowEventDetailsModal(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className={Cards.large + ' border-gold border-opacity-30 text-center'}>
              <CheckCircle size={48} className="text-gold mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">All Systems Operational</h3>
              <p className={Typography.bodyText + ' mb-6'}>No active incidents. Create one to test the recovery platform.</p>
              <button
                onClick={() => setShowNewEventDialog(true)}
                className={Buttons.primary}
              >
                <Plus size={18} />
                Create Test Incident
              </button>
            </div>
          )}
        </div>
      )}

      {/* Business Service Health Panel - Always show */}
      {!activeEventId && (
        <div>
          <h2 className={Badges.purpleOutline + ' mb-4'}>Business Service Health</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {services.map(service => {
              const cfg = STATUS_CONFIG[service.status as string] ?? STATUS_CONFIG.OPERATIONAL;
              return (
                <div
                  key={service.id as string}
                  className={clsx('rounded-lg border p-4 flex items-start justify-between backdrop-blur', cfg.color)}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={clsx('w-2 h-2 rounded-full shrink-0', cfg.dot)} />
                      <span className="font-medium text-sm text-white">{service.name as string}</span>
                    </div>
                    <p className="text-xs text-gray-300">{service.business_unit as string}</p>
                    <p className="text-xs text-gray-300 mt-0.5">RTO: {service.rto_minutes as number} min</p>
                  </div>
                  <span className="text-xs font-semibold shrink-0 ml-2 text-gray-300">{cfg.label}</span>
                </div>
              );
            })}

            {services.length === 0 && (
              <div className="col-span-3 bg-dark-900 bg-opacity-50 border border-purple-600 border-opacity-20 rounded-lg p-8 text-center text-gray-300 text-sm">
                No business services configured — add assets and services in the Asset Registry.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          isOpen={showEventDetailsModal}
          onClose={() => setShowEventDetailsModal(false)}
          onActivate={() => {
            setActiveEventId(selectedEvent.id);
            setShowEventDetailsModal(false);
          }}
        />
      )}

      <NewEventDialog
        isOpen={showNewEventDialog}
        onClose={() => setShowNewEventDialog(false)}
        onCreate={(newEvent) => {
          // In a real app, this would create the event
          console.log('Creating event:', newEvent);
          setShowNewEventDialog(false);
        }}
      />
    </div>
  );
}
