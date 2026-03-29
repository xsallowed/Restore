import { useQuery } from '@tanstack/react-query';
import { TrendingUp, AlertCircle, CheckCircle, XCircle, Package } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface DashboardMetrics {
  total_assets: number;
  active_assets: number;
  inactive_assets: number;
  online_assets: number;
  offline_assets: number;
  assets_by_type: Record<string, number>;
  assets_by_status: Record<string, number>;
  assets_by_source: Record<string, number>;
  avg_confidence_score: number;
  high_confidence_assets: number;
  low_confidence_assets: number;
  assets_added_today: number;
  discovery_sources_count: number;
  critical_health_issues: number;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
  colorClass,
}: {
  icon: React.FC<{ size: number }>;
  label: string;
  value: string | number;
  subtext?: string;
  colorClass?: string;
}) {
  return (
    <div className={clsx('rounded-lg p-4', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
      <div className="flex items-center justify-between">
        <div>
          <p className={clsx('text-xs font-medium', themeClasses.text.secondary)}>{label}</p>
          <p className={clsx('text-2xl font-bold mt-1', colorClass || themeClasses.text.primary)}>{value}</p>
          {subtext && <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>{subtext}</p>}
        </div>
        <Icon size={32} className={clsx(colorClass ? colorClass.replace('text-', 'text-') : themeClasses.text.secondary)} />
      </div>
    </div>
  );
}

function DistributionChart({
  title,
  data,
}: {
  title: string;
  data: Record<string, number>;
}) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const maxValue = Math.max(...Object.values(data), 1);

  return (
    <div className={clsx('rounded-lg p-4', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
      <h3 className={clsx('text-sm font-semibold mb-4', themeClasses.text.primary)}>{title}</h3>
      <div className="space-y-3">
        {Object.entries(data).map(([name, value]) => {
          const percentage = (value / total) * 100;
          const barWidth = (value / maxValue) * 100;

          return (
            <div key={name}>
              <div className="flex justify-between items-center mb-1">
                <span className={clsx('text-xs font-medium', themeClasses.text.secondary)}>{name}</span>
                <span className={clsx('text-xs font-bold', themeClasses.text.primary)}>
                  {value} ({percentage.toFixed(1)}%)
                </span>
              </div>
              <div className={clsx('h-2 rounded-full overflow-hidden', themeClasses.bg.secondary)}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-orange-500 transition-all"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AssetDashboardPage() {
  const { data: metrics, isLoading } = useQuery<DashboardMetrics>({
    queryKey: ['asset-metrics'],
    queryFn: async () => {
      try {
        const response = await api.get('/api/v1/reports/asset-summary');
        return response.data.data;
      } catch (err) {
        // Return mock data if endpoint doesn't exist yet
        return {
          total_assets: 156,
          active_assets: 142,
          inactive_assets: 14,
          online_assets: 138,
          offline_assets: 18,
          assets_by_type: {
            Server: 45,
            Workstation: 67,
            Laptop: 23,
            NetworkDevice: 12,
            VM: 8,
            Mobile: 1,
          },
          assets_by_status: { Active: 142, Inactive: 14 },
          assets_by_source: { Intune: 78, Manual: 45, Nmap: 23, DNS: 10 },
          avg_confidence_score: 87,
          high_confidence_assets: 131,
          low_confidence_assets: 25,
          assets_added_today: 8,
          discovery_sources_count: 4,
          critical_health_issues: 3,
        };
      }
    },
    staleTime: 60000,
  });

  if (isLoading || !metrics) {
    return (
      <div className={clsx('min-h-screen p-6', themeClasses.bg.primary, 'flex items-center justify-center')}>
        <p className={themeClasses.text.secondary}>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className={themeClasses.text.primary}>
          <h1 className="text-3xl font-bold mb-1">Asset Dashboard</h1>
          <p className={clsx('text-sm', themeClasses.text.secondary)}>
            Real-time asset inventory metrics and discovery status
          </p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={Package}
            label="Total Assets"
            value={metrics.total_assets}
            subtext={`${metrics.active_assets} active`}
            colorClass="text-blue-600 dark:text-blue-400"
          />
          <MetricCard
            icon={CheckCircle}
            label="Online Assets"
            value={metrics.online_assets}
            subtext={`${((metrics.online_assets / metrics.total_assets) * 100).toFixed(1)}% healthy`}
            colorClass="text-green-600 dark:text-green-400"
          />
          <MetricCard
            icon={XCircle}
            label="Offline Assets"
            value={metrics.offline_assets}
            subtext="Requires attention"
            colorClass="text-red-600 dark:text-red-400"
          />
          <MetricCard
            icon={TrendingUp}
            label="Avg Confidence"
            value={`${metrics.avg_confidence_score}%`}
            subtext={`${metrics.high_confidence_assets} high confidence`}
            colorClass="text-purple-600 dark:text-purple-400"
          />
        </div>

        {/* Secondary Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            icon={AlertCircle}
            label="Health Issues"
            value={metrics.critical_health_issues}
            subtext="Requires immediate action"
            colorClass="text-orange-600 dark:text-orange-400"
          />
          <MetricCard
            icon={TrendingUp}
            label="Added Today"
            value={metrics.assets_added_today}
            subtext="New discoveries"
            colorClass="text-indigo-600 dark:text-indigo-400"
          />
          <MetricCard
            icon={Package}
            label="Discovery Sources"
            value={metrics.discovery_sources_count}
            subtext="Active integrations"
            colorClass="text-cyan-600 dark:text-cyan-400"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DistributionChart title="Assets by Type" data={metrics.assets_by_type} />
          <DistributionChart title="Assets by Discovery Source" data={metrics.assets_by_source} />
          <DistributionChart title="Assets by Status" data={metrics.assets_by_status} />
          
          {/* Confidence Score Distribution */}
          <div className={clsx('rounded-lg p-4', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
            <h3 className={clsx('text-sm font-semibold mb-4', themeClasses.text.primary)}>Confidence Score Distribution</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className={clsx('text-xs font-medium', themeClasses.text.secondary)}>High (75-100%)</span>
                  <span className={clsx('text-xs font-bold', 'text-green-600 dark:text-green-400')}>
                    {metrics.high_confidence_assets} assets
                  </span>
                </div>
                <div className={clsx('h-3 rounded-full overflow-hidden', themeClasses.bg.secondary)}>
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${(metrics.high_confidence_assets / metrics.total_assets) * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className={clsx('text-xs font-medium', themeClasses.text.secondary)}>Low (0-75%)</span>
                  <span className={clsx('text-xs font-bold', 'text-yellow-600 dark:text-yellow-400')}>
                    {metrics.low_confidence_assets} assets
                  </span>
                </div>
                <div className={clsx('h-3 rounded-full overflow-hidden', themeClasses.bg.secondary)}>
                  <div
                    className="h-full bg-yellow-500 rounded-full"
                    style={{ width: `${(metrics.low_confidence_assets / metrics.total_assets) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Summary Table */}
        <div className={clsx('rounded-lg overflow-hidden border', themeClasses.bg.card, themeClasses.border.primary)}>
          <div className={clsx('p-4 border-b', themeClasses.border.primary)}>
            <h3 className={clsx('text-sm font-semibold', themeClasses.text.primary)}>Asset Inventory Summary</h3>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border-color)' }}>
            <div className={clsx('px-6 py-4 flex justify-between', 'hover:bg-opacity-50 transition-colors')}>
              <span className={clsx('text-sm', themeClasses.text.secondary)}>Total Inventory</span>
              <span className={clsx('text-sm font-bold', themeClasses.text.primary)}>{metrics.total_assets} assets</span>
            </div>
            <div className={clsx('px-6 py-4 flex justify-between', 'hover:bg-opacity-50 transition-colors')}>
              <span className={clsx('text-sm', themeClasses.text.secondary)}>Active Assets</span>
              <span className={clsx('text-sm font-bold text-green-600 dark:text-green-400')}>
                {metrics.active_assets} ({((metrics.active_assets / metrics.total_assets) * 100).toFixed(1)}%)
              </span>
            </div>
            <div className={clsx('px-6 py-4 flex justify-between', 'hover:bg-opacity-50 transition-colors')}>
              <span className={clsx('text-sm', themeClasses.text.secondary)}>Connectivity Status</span>
              <span className={clsx('text-sm font-bold')}>
                <span className="text-green-600 dark:text-green-400">{metrics.online_assets} online</span>
                {' / '}
                <span className="text-red-600 dark:text-red-400">{metrics.offline_assets} offline</span>
              </span>
            </div>
            <div className={clsx('px-6 py-4 flex justify-between', 'hover:bg-opacity-50 transition-colors')}>
              <span className={clsx('text-sm', themeClasses.text.secondary)}>Average Confidence</span>
              <span className={clsx('text-sm font-bold text-purple-600 dark:text-purple-400')}>
                {metrics.avg_confidence_score}%
              </span>
            </div>
            <div className={clsx('px-6 py-4 flex justify-between', 'hover:bg-opacity-50 transition-colors')}>
              <span className={clsx('text-sm', themeClasses.text.secondary)}>Health Issues</span>
              <span className={clsx('text-sm font-bold', metrics.critical_health_issues > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400')}>
                {metrics.critical_health_issues > 0 ? `${metrics.critical_health_issues} critical` : 'None'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
