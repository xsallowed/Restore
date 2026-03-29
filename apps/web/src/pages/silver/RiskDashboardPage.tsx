import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface RiskMetrics {
  total_assets: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  critical_by_type: Record<string, number>;
  high_by_type: Record<string, number>;
  priority_actions: Array<{
    asset_id: string;
    asset_name: string;
    asset_type: string;
    risk_level: string;
    reason: string;
    owner_email?: string;
  }>;
}

function RiskCard({
  icon: Icon,
  label,
  value,
  subtext,
  colorClass,
}: {
  icon: React.FC<{ size: number }>;
  label: string;
  value: number | string;
  subtext?: string;
  colorClass?: string;
}) {
  return (
    <div className={clsx('rounded-lg p-4', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
      <div className="flex items-center justify-between">
        <div>
          <p className={clsx('text-xs font-medium', themeClasses.text.secondary)}>{label}</p>
          <p className={clsx('text-2xl font-bold mt-2', colorClass || themeClasses.text.primary)}>{value}</p>
          {subtext && <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>{subtext}</p>}
        </div>
        <Icon size={32} className={colorClass || themeClasses.text.secondary} />
      </div>
    </div>
  );
}

function RiskBreakdownChart({ metrics }: { metrics: RiskMetrics }) {
  const total = metrics.total_assets;
  const criticalPct = ((metrics.critical_count / total) * 100).toFixed(1);
  const highPct = ((metrics.high_count / total) * 100).toFixed(1);
  const mediumPct = ((metrics.medium_count / total) * 100).toFixed(1);
  const lowPct = ((metrics.low_count / total) * 100).toFixed(1);

  return (
    <div className={clsx('rounded-lg p-4', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
      <h3 className={clsx('font-semibold mb-4', themeClasses.text.primary)}>Risk Distribution</h3>
      <div className="space-y-3">
        {[
          { label: 'Critical', value: metrics.critical_count, pct: criticalPct, color: 'bg-red-500' },
          { label: 'High', value: metrics.high_count, pct: highPct, color: 'bg-orange-500' },
          { label: 'Medium', value: metrics.medium_count, pct: mediumPct, color: 'bg-yellow-500' },
          { label: 'Low', value: metrics.low_count, pct: lowPct, color: 'bg-green-500' },
        ].map((item) => (
          <div key={item.label}>
            <div className="flex justify-between mb-1">
              <span className={clsx('text-sm font-medium', themeClasses.text.secondary)}>{item.label}</span>
              <span className={clsx('text-sm font-bold', themeClasses.text.primary)}>{item.value} ({item.pct}%)</span>
            </div>
            <div className={clsx('w-full h-2 rounded-full overflow-hidden', themeClasses.bg.secondary)}>
              <div
                className={clsx('h-full', item.color)}
                style={{ width: `${item.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RiskDashboardPage() {
  const navigate = useNavigate();

  const { data: metrics, isLoading } = useQuery<RiskMetrics>({
    queryKey: ['risk-metrics'],
    queryFn: async () => {
      try {
        const response = await api.get('/api/v1/risk/metrics');
        return response.data.data;
      } catch (err) {
        // Return mock data if endpoint doesn't exist yet
        return {
          total_assets: 0,
          critical_count: 0,
          high_count: 0,
          medium_count: 0,
          low_count: 0,
          critical_by_type: {},
          high_by_type: {},
          priority_actions: [],
        };
      }
    },
    staleTime: 30000,
  });

  if (!metrics) return null;

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Back Button */}
        <button onClick={() => navigate('/assets')} className={clsx('flex items-center gap-2', themeClasses.text.primary, 'hover:opacity-70 transition')}>
          <ArrowLeft size={20} />
          Back to Assets
        </button>

        {/* Header */}
        <div>
          <h1 className={clsx('text-3xl font-bold mb-1', themeClasses.text.primary)}>Risk Dashboard</h1>
          <p className={clsx('text-sm', themeClasses.text.secondary)}>Overview of credential, identity, and connection risks across your infrastructure</p>
        </div>

        {/* Risk Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <RiskCard
            icon={AlertTriangle}
            label="Critical Risks"
            value={metrics.critical_count}
            colorClass="text-red-600 dark:text-red-400"
          />
          <RiskCard
            icon={AlertCircle}
            label="High Risks"
            value={metrics.high_count}
            colorClass="text-orange-600 dark:text-orange-400"
          />
          <RiskCard
            icon={TrendingUp}
            label="Medium Risks"
            value={metrics.medium_count}
            colorClass="text-yellow-600 dark:text-yellow-400"
          />
          <RiskCard
            icon={CheckCircle}
            label="Low Risks"
            value={metrics.low_count}
            colorClass="text-green-600 dark:text-green-400"
          />
          <RiskCard
            icon={TrendingUp}
            label="Total Assets"
            value={metrics.total_assets}
            subtext="Requiring attention"
          />
        </div>

        {/* Risk Breakdown Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <RiskBreakdownChart metrics={metrics} />
          </div>

          {/* Risk Type Breakdown */}
          <div className={clsx('rounded-lg p-4', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
            <h3 className={clsx('font-semibold mb-4', themeClasses.text.primary)}>Critical by Type</h3>
            <div className="space-y-2">
              {Object.entries(metrics.critical_by_type).map(([type, count]) => (
                <div key={type} className="flex justify-between items-center">
                  <span className={clsx('text-sm', themeClasses.text.secondary)}>{type}</span>
                  <span className={clsx('px-2 py-1 rounded text-xs font-semibold', 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200')}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Priority Actions */}
        <div className={clsx('rounded-lg p-4', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
          <h3 className={clsx('font-semibold mb-4', themeClasses.text.primary)}>Priority Actions (Top 10)</h3>
          {metrics.priority_actions.length === 0 ? (
            <p className={clsx('text-sm text-center py-8', themeClasses.text.secondary)}>No priority actions - all risks managed!</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className={clsx('border-b', themeClasses.border.primary)}>
                  <tr>
                    <th className={clsx('text-left py-2 px-3 font-semibold', themeClasses.text.secondary)}>Asset</th>
                    <th className={clsx('text-left py-2 px-3 font-semibold', themeClasses.text.secondary)}>Type</th>
                    <th className={clsx('text-left py-2 px-3 font-semibold', themeClasses.text.secondary)}>Risk</th>
                    <th className={clsx('text-left py-2 px-3 font-semibold', themeClasses.text.secondary)}>Reason</th>
                    <th className={clsx('text-left py-2 px-3 font-semibold', themeClasses.text.secondary)}>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.priority_actions.slice(0, 10).map((action, idx) => (
                    <tr key={idx} className={clsx('border-b', themeClasses.border.primary)}>
                      <td className={clsx('py-2 px-3', themeClasses.text.primary)}>{action.asset_name}</td>
                      <td className={clsx('py-2 px-3 text-xs', themeClasses.text.secondary)}>{action.asset_type}</td>
                      <td className={clsx('py-2 px-3')}>
                        <span className={clsx(
                          'px-2 py-1 rounded text-xs font-semibold',
                          action.risk_level === 'Critical'
                            ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                            : action.risk_level === 'High'
                            ? 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200'
                            : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                        )}>
                          {action.risk_level}
                        </span>
                      </td>
                      <td className={clsx('py-2 px-3 text-xs', themeClasses.text.secondary)}>{action.reason}</td>
                      <td className={clsx('py-2 px-3 text-xs', themeClasses.text.secondary)}>{action.owner_email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
