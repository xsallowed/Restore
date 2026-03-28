import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { eventsApi } from '../lib/api';
import { AlertTriangle, Plus } from 'lucide-react';
import clsx from 'clsx';
import { themeClasses } from '../lib/themeClasses';
import { EventCard } from '../components/recovery/EventCard';

export function EventsLandingPage() {
  const navigate = useNavigate();

  const { data: eventsData } = useQuery({
    queryKey: ['events', 'active'],
    queryFn: () => eventsApi.list({ status: 'IN_PROGRESS' }).then(r => r.data.data),
    refetchInterval: 15_000,
  });

  const activeEvents = eventsData ?? [];

  return (
    <div className={clsx(themeClasses.bg.primary, 'min-h-screen')}>
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Active Events</h1>
              <p className={clsx(themeClasses.text.secondary, 'text-lg mt-2')}>
                Manage and respond to critical incidents in real-time
              </p>
            </div>
            <button
              onClick={() => navigate('/events/new')}
              className={clsx(themeClasses.button.primary, 'flex items-center gap-2 px-4 py-3 rounded-lg font-medium')}
            >
              <Plus size={20} />
              Create Event
            </button>
          </div>
        </div>

        {/* Events Grid */}
        {activeEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeEvents.map((event: any) => (
              <div
                key={event.id as string}
                onClick={() => navigate(`/dashboard?eventId=${event.id}`)}
                className="cursor-pointer"
              >
                <EventCard
                  id={event.id as string}
                  title={event.title as string}
                  event_type={event.event_type as string}
                  severity={event.severity as any}
                  status={event.status as any}
                  opened_at={event.opened_at as string}
                  commander_name={event.commander_name as string}
                  onClick={() => navigate(`/dashboard?eventId=${event.id}`)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className={clsx(themeClasses.card, 'border-gray-300 dark:border-gray-700 rounded-xl p-12 text-center shadow-sm dark:shadow-md')}>
            <AlertTriangle size={48} className="text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <h2 className={clsx(themeClasses.text.primary, 'text-xl font-semibold mb-2')}>No Active Events</h2>
            <p className={clsx(themeClasses.text.secondary, 'mb-6')}>
              There are currently no active events. Create one to get started.
            </p>
            <button
              onClick={() => navigate('/events/new')}
              className={clsx(themeClasses.button.primary, 'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium')}
            >
              <Plus size={18} />
              Create Event
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
