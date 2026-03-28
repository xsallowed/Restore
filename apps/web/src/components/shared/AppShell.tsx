import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import { useTheme } from '../../lib/themeContext';
import {
  LayoutDashboard, AlertTriangle, Database, Users,
  BookOpen, ClipboardList, LogOut, Shield, Play,
  BarChart3, BarChart2, Plug, ChevronRight, Network,
  Sun, Moon
} from 'lucide-react';
import clsx from 'clsx';
import { theme } from '../../lib/themeStyles';

const TIER_STYLES = {
  BRONZE: { bg: 'bg-amber-600 dark:bg-amber-700', text: 'text-white', label: 'Bronze' },
  SILVER: { bg: 'bg-blue-600 dark:bg-blue-700', text: 'text-white', label: 'Silver' },
  GOLD:   { bg: 'bg-gold dark:bg-gold', text: 'text-gray-900', label: 'Gold' },
  AUTHOR: { bg: 'bg-purple-600 dark:bg-purple-700', text: 'text-white', label: 'Author' },
  ADMIN:  { bg: 'bg-gray-700 dark:bg-gray-600', text: 'text-white', label: 'Admin' },
};

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  tiers: string[];
}

const NAV: NavItem[] = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard',          tiers: ['SILVER','AUTHOR','ADMIN'] },
  { to: '/events',     icon: AlertTriangle,   label: 'Events',             tiers: ['BRONZE','SILVER','AUTHOR','ADMIN'] },
  { to: '/assets',     icon: Database,        label: 'Asset Registry',     tiers: ['SILVER','AUTHOR','ADMIN'] },
  { to: '/services',   icon: Users,           label: 'Business Services',  tiers: ['SILVER','AUTHOR','ADMIN'] },
  { to: '/dependencies', icon: Network,       label: 'Dependency Map',     tiers: ['SILVER','AUTHOR','ADMIN'] },
  { to: '/audit',      icon: ClipboardList,   label: 'Audit',              tiers: ['SILVER','GOLD','AUTHOR','ADMIN'] },
  { to: '/connectors', icon: Plug,            label: 'Connectors',         tiers: ['AUTHOR','ADMIN'] },
];

export function AppShell() {
  const { user, clearAuth } = useAuth();
  const { theme: currentTheme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const tier = user?.restore_tier ?? 'BRONZE';
  const tierStyle = TIER_STYLES[tier as keyof typeof TIER_STYLES] ?? TIER_STYLES.BRONZE;
  const visibleNav = NAV.filter(n => n.tiers.includes(tier));

  return (
    <div className={clsx(
      'flex h-screen overflow-hidden transition-colors',
      currentTheme === 'dark' ? 'bg-gray-950 dark' : 'bg-gray-50'
    )}>
      {/* Sidebar */}
      <aside className={clsx(
        'w-56 flex flex-col shrink-0 border-r transition-colors',
        currentTheme === 'dark'
          ? 'bg-gray-900 border-gray-800'
          : 'bg-white border-gray-200'
      )}>
        {/* Logo */}
        <div className={clsx(
          'px-4 py-5 border-b transition-colors',
          currentTheme === 'dark'
            ? 'border-gray-800'
            : 'border-gray-200'
        )}>
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-purple-600" />
            <span className={clsx('text-lg font-bold tracking-tight', theme.text.primary)}>
              Restore
            </span>
          </div>
          <p className={clsx('text-xs mt-0.5 truncate', currentTheme === 'dark' ? 'text-gray-400' : 'text-gray-500')}>
            Resilience Orchestration
          </p>
        </div>

        {/* User + Tier badge */}
        <div className={clsx(
          'px-4 py-3 border-b transition-colors',
          currentTheme === 'dark'
            ? 'border-gray-800'
            : 'border-gray-200'
        )}>
          <div className="flex items-center gap-2">
            <div className={clsx(
              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
              currentTheme === 'dark'
                ? 'bg-gray-800 text-gray-200'
                : 'bg-gray-200 text-gray-800'
            )}>
              {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className={clsx('text-sm font-medium truncate', theme.text.primary)}>
                {user?.displayName}
              </p>
              <span className={clsx('inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider', tierStyle.bg, tierStyle.text)}>
                {tierStyle.label}
              </span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleNav.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors group relative',
                isActive
                  ? currentTheme === 'dark'
                    ? 'bg-gray-800 text-white font-medium'
                    : 'bg-gray-100 text-gray-900 font-medium'
                  : currentTheme === 'dark'
                    ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              )}
            >
              {({ isActive }) => (
                <>
                  <item.icon size={16} className={isActive ? 'text-purple-600' : ''} />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight size={12} className="ml-auto" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Theme Toggle & Logout */}
        <div className={clsx(
          'border-t transition-colors space-y-1 p-2',
          currentTheme === 'dark'
            ? 'border-gray-800'
            : 'border-gray-200'
        )}>
          <button
            onClick={toggleTheme}
            className={clsx(
              'w-full flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg transition-colors',
              currentTheme === 'dark'
                ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            )}
            title={`Switch to ${currentTheme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {currentTheme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            <span>{currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          <button
            onClick={() => { clearAuth(); navigate('/login'); }}
            className={clsx(
              'w-full flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg transition-colors',
              currentTheme === 'dark'
                ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            )}
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={clsx(
        'flex-1 overflow-y-auto transition-colors',
        currentTheme === 'dark'
          ? 'bg-gray-950'
          : 'bg-gray-50'
      )}>
        {/* Rehearsal banner */}
        {window.location.search.includes('rehearsal=true') && (
          <div className="bg-red-600 text-white text-center text-sm font-bold py-2 px-4 flex items-center justify-center gap-2">
            <Play size={14} />
            REHEARSAL MODE — No live systems will be affected
          </div>
        )}
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
