import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../store/auth';
import {
  LayoutDashboard, AlertTriangle, Database, Users,
  BookOpen, ClipboardList, LogOut, Shield, Play,
  BarChart3, BarChart2, Plug, ChevronRight, Network
} from 'lucide-react';
import clsx from 'clsx';

const TIER_STYLES = {
  BRONZE: { bg: 'bg-bronze-600', text: 'text-white', label: 'Bronze', ring: 'ring-bronze-600' },
  SILVER: { bg: 'bg-silver-600', text: 'text-white', label: 'Silver', ring: 'ring-silver-600' },
  GOLD:   { bg: 'bg-gold-600',   text: 'text-white', label: 'Gold',   ring: 'ring-gold-600'   },
  AUTHOR: { bg: 'bg-purple-600', text: 'text-white', label: 'Author', ring: 'ring-purple-600' },
  ADMIN:  { bg: 'bg-gray-800',   text: 'text-white', label: 'Admin',  ring: 'ring-gray-800'   },
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
  const navigate = useNavigate();
  const tier = user?.restore_tier ?? 'BRONZE';
  const style = TIER_STYLES[tier as keyof typeof TIER_STYLES] ?? TIER_STYLES.BRONZE;
  const visibleNav = NAV.filter(n => n.tiers.includes(tier));

  return (
    <div className="flex h-screen overflow-hidden bg-dark-950">
      {/* Sidebar */}
      <aside className="w-56 flex flex-col bg-dark-900 border-r border-brand-600 border-opacity-20 text-white shrink-0">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-blue-300" />
            <span className="text-lg font-bold tracking-tight">Restore</span>
          </div>
          <p className="text-xs text-blue-200 mt-0.5 truncate">Resilience Orchestration</p>
        </div>

        {/* User + Tier badge */}
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold shrink-0">
              {user?.displayName?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.displayName}</p>
              <span className={clsx('inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider', style.bg, style.text)}>
                {style.label}
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
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-white/15 text-white font-medium'
                  : 'text-blue-100 hover:bg-white/10 hover:text-white'
              )}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
              {({ isActive }: { isActive: boolean }) => isActive && <ChevronRight size={12} className="ml-auto" />}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <button
          onClick={() => { clearAuth(); navigate('/login'); }}
          className="flex items-center gap-3 px-4 py-3 text-sm text-blue-200 hover:text-white hover:bg-white/10 border-t border-white/10 transition-colors"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Rehearsal banner */}
        {window.location.search.includes('rehearsal=true') && (
          <div className="bg-amber-500 text-amber-900 text-center text-sm font-bold py-2 px-4 flex items-center justify-center gap-2">
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
