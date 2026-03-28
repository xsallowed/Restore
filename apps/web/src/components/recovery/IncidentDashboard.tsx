import { AlertTriangle, Clock, Zap, Target, TrendingDown, Activity, CheckCircle, AlertCircle } from 'lucide-react';
import { differenceInMinutes, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

interface IncidentMetrics {
  eventTitle: string;
  eventType: string;
  severity: 'P1' | 'P2' | 'P3' | 'P4';
  status: string;
  opened_at: string;
  total_estimated_minutes: number;
  ml_ttfr_minutes?: number;
  ml_ttfr_confidence_low?: number;
  ml_ttfr_confidence_high?: number;
  recovery_confidence_score?: number;
  steps_total: number;
  steps_completed: number;
  steps_in_progress: number;
  affected_services: number;
}

interface IncidentDashboardProps {
  metrics: IncidentMetrics;
}

const SEVERITY_COLOR = {
  P1: 'from-red-600 to-red-700',
  P2: 'from-orange to-orange',
  P3: 'from-gold to-gold',
  P4: 'from-purple-600 to-purple-700',
};

const SEVERITY_LABEL = {
  P1: 'Critical',
  P2: 'High',
  P3: 'Medium',
  P4: 'Low',
};

export function IncidentDashboard({ metrics }: IncidentDashboardProps) {
  const timeElapsed = differenceInMinutes(new Date(), new Date(metrics.opened_at));
  const timeRemaining = Math.max(0, metrics.total_estimated_minutes - timeElapsed);
  const progressPercent = Math.min(100, (metrics.steps_completed / metrics.steps_total) * 100);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-lg bg-dark-900 bg-opacity-50 backdrop-blur border border-purple-600 border-opacity-30 p-8 shadow-glow">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className={clsx(
                'w-3 h-3 rounded-full',
                metrics.severity === 'P1' ? 'bg-red-500' :
                metrics.severity === 'P2' ? 'bg-orange' :
                metrics.severity === 'P3' ? 'bg-gold' :
                'bg-purple-500'
              )} />
              <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Active Incident</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">{metrics.eventTitle}</h1>
            <p className="text-gray-300">{metrics.eventType}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-purple-300 uppercase tracking-wider mb-2">Severity Level</p>
            <p className="text-2xl font-bold text-white">{metrics.severity}</p>
            <p className="text-xs text-dark-200 mt-1">{SEVERITY_LABEL[metrics.severity]}</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-dark-200">Overall Progress</span>
            <span className="text-xs font-semibold text-orange">{Math.round(progressPercent)}%</span>
          </div>
          <div className="w-full h-2 bg-dark-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-purple-orange transition-all duration-500 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Time Elapsed', value: `${timeElapsed}m`, icon: '⏱️' },
            { label: 'Est. Time Left', value: `${timeRemaining}m`, icon: '⏳' },
            { label: 'Tasks Done', value: `${metrics.steps_completed}/${metrics.steps_total}`, icon: '✓' },
            { label: 'Services Down', value: metrics.affected_services, icon: '⚠️' },
          ].map((stat, idx) => (
            <div key={idx} className="bg-dark-800 bg-opacity-50 rounded-lg p-3 border border-purple-600 border-opacity-20">
              <p className="text-xs text-dark-200 font-medium mb-1">{stat.label}</p>
              <p className="text-lg font-semibold text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: 'TIME TO FIRST RECOVERY',
            value: metrics.ml_ttfr_minutes || 'N/A',
            unit: 'min',
            detail: metrics.ml_ttfr_confidence_low ? `Range: ${metrics.ml_ttfr_confidence_low}-${metrics.ml_ttfr_confidence_high} min` : undefined,
            icon: Zap,
            color: 'border-purple-600 border-opacity-30',
            textColor: 'text-purple-400',
          },
          {
            title: 'RECOVERY CONFIDENCE',
            value: metrics.recovery_confidence_score ? Math.round(metrics.recovery_confidence_score * 100) : 'N/A',
            unit: '%',
            detail: 'ML-powered prediction',
            icon: CheckCircle,
            color: 'border-gold border-opacity-30',
            textColor: 'text-gold',
          },
          {
            title: 'TASKS COMPLETED',
            value: `${metrics.steps_completed}/${metrics.steps_total}`,
            unit: 'steps',
            detail: 'Recovery sequence',
            icon: Activity,
            color: 'border-orange border-opacity-30',
            textColor: 'text-orange',
          },
          {
            title: 'ACTIVE TASKS',
            value: metrics.steps_in_progress,
            unit: 'running',
            detail: 'in progress',
            icon: AlertCircle,
            color: 'border-pink border-opacity-30',
            textColor: 'text-pink',
          },
        ].map((kpi, idx) => (
          <div key={idx} className={clsx('rounded-lg border p-5 transition-all hover:shadow-glow bg-dark-900 bg-opacity-50 backdrop-blur', kpi.color)}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-dark-200 uppercase tracking-wider mb-2">{kpi.title}</p>
                <p className="text-3xl font-bold text-white">{kpi.value}</p>
                {kpi.detail && <p className="text-xs text-dark-200 mt-2">{kpi.detail}</p>}
              </div>
              <kpi.icon size={24} className={clsx('shrink-0', kpi.textColor)} />
            </div>
          </div>
        ))}
      </div>

      {/* Key Factors to Decrease Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Optimization Factors */}
        <div className="bg-dark-900 bg-opacity-50 backdrop-blur border border-orange border-opacity-30 rounded-lg p-6 shadow-sm">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingDown size={18} className="text-orange" />
            Key Factors to Decrease Time
          </h3>
          <div className="space-y-2">
            {[
              { label: 'Parallelize non-dependent tasks', impact: 'High' },
              { label: 'Pre-allocate resources', impact: 'High' },
              { label: 'Automate manual approvals', impact: 'Medium' },
              { label: 'Improve runbook clarity', impact: 'Medium' },
              { label: 'Increase team communication', impact: 'Low' },
            ].map((factor, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-dark-800 bg-opacity-50 rounded-lg hover:border-orange hover:border-opacity-50 border border-transparent transition-colors">
                <span className="text-sm text-dark-200">{factor.label}</span>
                <span className={clsx('text-xs font-semibold px-2 py-1 rounded',
                  factor.impact === 'High' ? 'bg-red-500 bg-opacity-20 text-red-200' :
                  factor.impact === 'Medium' ? 'bg-orange bg-opacity-20 text-orange' :
                  'bg-purple-600 bg-opacity-20 text-purple-200'
                )}>
                  {factor.impact}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Mitigation */}
        <div className="bg-dark-900 bg-opacity-50 backdrop-blur border border-red-600 border-opacity-30 rounded-lg p-6 shadow-sm">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-400" />
            Active Risks & Blockers
          </h3>
          <div className="space-y-2">
            {[
              { title: 'Database Replication Lag', status: 'monitoring', severity: 'medium' },
              { title: 'Vendor Support Response Time', status: 'blocked', severity: 'high' },
              { title: 'Network Bandwidth Constraint', status: 'active', severity: 'medium' },
            ].map((risk, idx) => (
              <div key={idx} className="p-3 bg-dark-800 bg-opacity-50 rounded-lg hover:border-red-600 hover:border-opacity-50 border border-transparent transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{risk.title}</p>
                    <p className={clsx('text-xs mt-1 font-medium',
                      risk.status === 'blocked' ? 'text-red-400' :
                      risk.status === 'active' ? 'text-orange' :
                      'text-purple-400'
                    )}>
                      {risk.status.charAt(0).toUpperCase() + risk.status.slice(1)}
                    </p>
                  </div>
                  <span className={clsx('text-xs font-semibold px-2 py-1 rounded',
                    risk.severity === 'high' ? 'bg-red-500 bg-opacity-20 text-red-200' :
                    'bg-orange bg-opacity-20 text-orange'
                  )}>
                    {risk.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
