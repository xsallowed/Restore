import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { eventsApi } from '../lib/api';
import { AlertTriangle, Plus, Clock, BarChart3, Layers3, Settings, Shield, Archive } from 'lucide-react';
import clsx from 'clsx';
import { themeClasses } from '../lib/themeClasses';
import { EventCard } from '../components/recovery/EventCard';
import { useRecentSections } from '../hooks/useRecentSections';

const AVAILABLE_SECTIONS = [
  { path: '/assets', name: 'Asset Registry', icon: Layers3, color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-200' },
  { path: '/services', name: 'Business Services', icon: Shield, color: 'bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200' },
  { path: '/dependencies', name: 'Dependency Map', icon: BarChart3, color: 'bg-orange-100 dark:bg-orange-900/40 text-orange-900 dark:text-orange-200' },
  { path: '/audit', name: 'Audit Log', icon: Archive, color: 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-200' },
  { path: '/connectors', name: 'Connectors', icon: Settings, color: 'bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-200' },
  { path: '/rehearsals', name: 'Rehearsals', icon: Clock, color: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-200' },
];

export function HomePage() {
  const navigate = useNavigate();
  const { getRecentSections } = useRecentSections();

  const { data: eventsData } = useQuery({
    queryKey: ['events', 'active'],
    queryFn: () => eventsApi.list({ status: 'IN_PROGRESS' }).then(r => r.data.data),
    refetchInterval: 15_000,
  });

  const activeEvents = eventsData ?? [];
  const recentSections = getRecentSections();

  // Get section details from available sections
  const recentSectionDetails = recentSections
    .map(recent => AVAILABLE_SECTIONS.find(s => s.path === recent.path))
    .filter(Boolean) as (typeof AVAILABLE_SECTIONS)[0][];

  return (
    <div className={clsx(themeClasses.bg.primary, 'min-h-screen')}>
      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Welcome Section */}
        <div className="mb-12">
          <h1 className={clsx(themeClasses.text.primary, 'text-4xl font-bold mb-2')}>
            Welcome Back
          </h1>
          <p className={clsx(themeClasses.text.secondary, 'text-lg')}>
            Manage and respond to incidents in real-time
          </p>
        </div>

        {/* Active Events Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className={clsx(themeClasses.text.primary, 'text-2xl font-bold')}>
                Active Events
              </h2>
              <p className={clsx(themeClasses.text.secondary, 'text-sm mt-1')}>
                {activeEvents.length} incident{activeEvents.length !== 1 ? 's' : ''} require your attention
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
              <h3 className={clsx(themeClasses.text.primary, 'text-xl font-semibold mb-2')}>
                No Active Events
              </h3>
              <p className={clsx(themeClasses.text.secondary, 'mb-6')}>
                All systems are operational. Start a drill or wait for incidents to appear.
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

        {/* Recently Accessed Section */}
        {recentSectionDetails.length > 0 && (
          <div className="mb-12">
            <h2 className={clsx(themeClasses.text.primary, 'text-2xl font-bold mb-6')}>
              Recently Accessed
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {recentSectionDetails.map(section => (
                <button
                  key={section.path}
                  onClick={() => navigate(section.path)}
                  className={clsx(
                    section.color,
                    themeClasses.card,
                    'border-gray-300 dark:border-gray-700 rounded-lg p-4 flex flex-col items-center gap-3 transition-all hover:shadow-md dark:hover:shadow-lg hover:scale-105'
                  )}
                >
                  <section.icon size={24} />
                  <span className="text-sm font-semibold text-center">{section.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* All Sections Quick Access */}
        <div>
          <h2 className={clsx(themeClasses.text.primary, 'text-2xl font-bold mb-6')}>
            Quick Access
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {AVAILABLE_SECTIONS.map(section => (
              <button
                key={section.path}
                onClick={() => navigate(section.path)}
                className={clsx(
                  section.color,
                  themeClasses.card,
                  'border-gray-300 dark:border-gray-700 rounded-lg p-4 flex flex-col items-center gap-3 transition-all hover:shadow-md dark:hover:shadow-lg hover:scale-105'
                )}
              >
                <section.icon size={24} />
                <span className="text-sm font-semibold text-center">{section.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
