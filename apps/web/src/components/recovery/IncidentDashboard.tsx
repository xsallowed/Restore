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
  P2: 'from-orange-600 to-orange-700',
  P3: 'from-yellow-600 to-yellow-700',
  P4: 'from-gray-600 to-gray-700',
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
  const ttfrConfidenceAvg = metrics.ml_ttfr_confidence_low && metrics.ml_ttfr_confidence_high
    ? Math.round((metrics.ml_ttfr_confidence_low + metrics.ml_ttfr_confidence_high) / 2)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className={clsx(
        'relative overflow-hidden rounded-2xl bg-gradient-to-r p-8 text-white shadow-lg',
        SEVERITY_COLOR[metrics.severity]
      )}>
        <div className="absolute top-0 right-0 opacity-10 w-96 h-96 -mr-48 -mt-48 rounded-full bg-white" />
        
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-1">{metrics.eventTitle}</h1>
              <p className="text-white/80">{metrics.eventType}</p>
            </div>
            <div className="text-right">
              <div className="inline-block px-4 py-2 bg-white/20 backdrop-blur rounded-xl">
                <p className="text-xs font-semibold opacity-80">SEVERITY</p>
                <p className="text-xl font-bold">{metrics.severity} - {SEVERITY_LABEL[metrics.severity]}</p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <p className="text-xs opacity-80 mb-1">Time Elapsed</p>
              <p className="text-lg font-bold">{timeElapsed}m</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <p className="text-xs opacity-80 mb-1">Est. Time Left</p>
              <p className="text-lg font-bold">{timeRemaining}m</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <p className="text-xs opacity-80 mb-1">Progress</p>
              <p className="text-lg font-bold">{progressPercent}%</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-lg p-3">
              <p className="text-xs opacity-80 mb-1">Services Down</p>
              <p className="text-lg font-bold">{metrics.affected_services}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Time to First Recovery */}
        <div className="bg-white border-2 border-blue-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-gray-600 font-medium mb-1">TIME TO FIRST RECOVERY</p>
              <p className="text-3xl font-bold text-gray-900">{metrics.ml_ttfr_minutes || 'N/A'}</p>
              <p className="text-xs text-gray-500 mt-1">minutes (estimated)</p>
            </div>
            <Zap className="text-blue-600" size={28} />
          </div>
          {metrics.ml_ttfr_confidence_low && (
            <div className="text-xs text-gray-600">
              Range: {metrics.ml_ttfr_confidence_low}-{metrics.ml_ttfr_confidence_high} min
            </div>
          )}
        </div>

        {/* Recovery Confidence */}
        <div className="bg-white border-2 border-green-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-gray-600 font-medium mb-1">RECOVERY CONFIDENCE</p>
              <p className="text-3xl font-bold text-gray-900">
                {metrics.recovery_confidence_score 
                  ? Math.round(metrics.recovery_confidence_score * 100) 
                  : 'N/A'}%
              </p>
              <p className="text-xs text-gray-500 mt-1">ML-powered prediction</p>
            </div>
            <CheckCircle className="text-green-600" size={28} />
          </div>
        </div>

        {/* Task Completion */}
        <div className="bg-white border-2 border-purple-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-gray-600 font-medium mb-1">TASKS COMPLETED</p>
              <p className="text-3xl font-bold text-gray-900">
                {metrics.steps_completed}/{metrics.steps_total}
              </p>
              <p className="text-xs text-gray-500 mt-1">Recovery steps</p>
            </div>
            <Activity className="text-purple-600" size={28} />
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Active Tasks */}
        <div className="bg-white border-2 border-orange-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-gray-600 font-medium mb-1">ACTIVE TASKS</p>
              <p className="text-3xl font-bold text-gray-900">{metrics.steps_in_progress}</p>
              <p className="text-xs text-gray-500 mt-1">in progress</p>
            </div>
            <AlertCircle className="text-orange-600" size={28} />
          </div>
        </div>
      </div>

      {/* Key Factors to Decrease Time */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Optimization Factors */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-6">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <TrendingDown size={20} className="text-blue-600" />
            Key Factors to Decrease Time
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Parallelize non-dependent tasks', icon: '⚡', impact: 'High' },
              { label: 'Pre-allocate resources', icon: '💾', impact: 'High' },
              { label: 'Automate manual approvals', icon: '🤖', impact: 'Medium' },
              { label: 'Improve runbook clarity', icon: '📋', impact: 'Medium' },
              { label: 'Increase team communication', icon: '💬', impact: 'Low' },
            ].map((factor, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-blue-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{factor.icon}</span>
                  <span className="text-sm text-gray-700">{factor.label}</span>
                </div>
                <span className={clsx('text-xs font-semibold px-2 py-1 rounded', 
                  factor.impact === 'High' ? 'bg-red-100 text-red-800' :
                  factor.impact === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                )}>
                  {factor.impact}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Mitigation */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl p-6">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} className="text-orange-600" />
            Active Risks & Blockers
          </h3>
          <div className="space-y-3">
            {[
              { title: 'Database Replication Lag', status: 'monitoring', severity: 'medium' },
              { title: 'Vendor Support Response Time', status: 'blocked', severity: 'high' },
              { title: 'Network Bandwidth Constraint', status: 'active', severity: 'medium' },
            ].map((risk, idx) => (
              <div key={idx} className="p-3 bg-gray-50 rounded-lg hover:bg-red-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{risk.title}</p>
                    <p className={clsx('text-xs mt-1', 
                      risk.status === 'blocked' ? 'text-red-600' :
                      risk.status === 'active' ? 'text-orange-600' :
                      'text-blue-600'
                    )}>
                      {risk.status.charAt(0).toUpperCase() + risk.status.slice(1)}
                    </p>
                  </div>
                  <span className={clsx('text-xs font-semibold px-2 py-1 rounded',
                    risk.severity === 'high' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
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
