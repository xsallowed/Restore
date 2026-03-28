import { useQuery } from '@tanstack/react-query';
import { dashboardApi, servicesApi } from '../../lib/api';
import { useSSE } from '../../lib/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, PieChart, Pie, Cell
} from 'recharts';
import { CheckCircle, AlertTriangle, TrendingDown, Clock, FileDown } from 'lucide-react';
import clsx from 'clsx';

const STATUS_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  OPERATIONAL:        { bg: 'bg-dark-800',  text: 'text-green-800',  bar: '#22c55e' },
  DEGRADED:           { bg: 'bg-yellow-50', text: 'text-yellow-800', bar: '#eab308' },
  PARTIALLY_IMPACTED: { bg: 'bg-orange-50', text: 'text-orange-800', bar: '#f97316' },
  DOWN:               { bg: 'bg-dark-800',    text: 'text-red-800',    bar: '#ef4444' },
  RECOVERING:         { bg: 'bg-dark-800',   text: 'text-blue-800',   bar: '#3b82f6' },
  RESTORED:           { bg: 'bg-dark-800',  text: 'text-green-700',  bar: '#4ade80' },
};

export function GoldDashboard() {
  useSSE(); // Subscribe to health changes only — Gold gets aggregated updates

  const { data: execData } = useQuery({
    queryKey: ['executive-dashboard'],
    queryFn: () => dashboardApi.executive().then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const { data: servicesData } = useQuery({
    queryKey: ['business-services'],
    queryFn: () => servicesApi.list().then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const exec = execData as Record<string, unknown> | undefined;
  const services: Record<string, unknown>[] = servicesData ?? [];

  const downServices = services.filter(s => s.status === 'DOWN').length;
  const impactedServices = services.filter(s => !['OPERATIONAL', 'RESTORED'].includes(s.status as string)).length;
  const operationalServices = services.filter(s => s.status === 'OPERATIONAL').length;

  // Pie data for service health distribution
  const pieData = [
    { name: 'Operational', value: operationalServices, fill: '#22c55e' },
    { name: 'Impacted',    value: impactedServices - downServices, fill: '#f97316' },
    { name: 'Down',        value: downServices, fill: '#ef4444' },
  ].filter(d => d.value > 0);

  const mttr = exec?.avgMttrMinutes as number ?? 0;
  const activeEvents = exec?.activeEventCount as number ?? 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Gold tier header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block text-xs font-bold px-2 py-0.5 bg-gold-50 text-gold-600 rounded uppercase tracking-wider">
              Gold — Executive View
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white">Recovery Intelligence Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Business service health overview — updated {new Date().toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 text-sm text-gray-600 border border-gray-600 px-4 py-2 rounded-lg hover:bg-dark-800"
        >
          <FileDown size={15} />
          Export Summary
        </button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: 'Active Recovery Events',
            value: activeEvents,
            icon: AlertTriangle,
            color: activeEvents > 0 ? 'text-red-500' : 'text-green-500',
            bg: activeEvents > 0 ? 'bg-dark-800' : 'bg-dark-800',
          },
          {
            label: 'Services Impacted',
            value: impactedServices,
            icon: TrendingDown,
            color: impactedServices > 0 ? 'text-orange-500' : 'text-green-500',
            bg: impactedServices > 0 ? 'bg-orange-50' : 'bg-dark-800',
          },
          {
            label: 'Services Operational',
            value: operationalServices,
            icon: CheckCircle,
            color: 'text-green-500',
            bg: 'bg-dark-800',
          },
          {
            label: 'Avg MTTR (90 days)',
            value: mttr > 0 ? `${Math.round(mttr / 60 * 10) / 10}h` : '–',
            icon: Clock,
            color: 'text-purple-500',
            bg: 'bg-dark-800',
          },
        ].map(metric => (
          <div key={metric.label} className={clsx('rounded-xl p-4 flex items-center gap-3', metric.bg)}>
            <metric.icon size={22} className={metric.color} />
            <div>
              <p className="text-2xl font-bold text-white">{metric.value}</p>
              <p className="text-xs text-gray-600 mt-0.5">{metric.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Business service health panel — 2/3 width */}
        <div className="col-span-2 bg-dark-900 bg-opacity-50 border border-gray-600 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-700">
            <h2 className="font-semibold text-white text-sm">Business Service Health</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {services.map(service => {
              const cfg = STATUS_COLORS[service.status as string] ?? STATUS_COLORS.OPERATIONAL;
              const rtoPct = service.rto_minutes
                ? Math.min(100, Math.round(((service.rto_minutes as number) / 240) * 100))
                : 50;

              return (
                <div key={service.id as string} className={clsx('px-5 py-3 flex items-center gap-4', cfg.bg)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-white">{service.name as string}</span>
                      <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', cfg.text, cfg.bg)}>
                        {String(service.status).replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {service.business_unit as string} · RTO {service.rto_minutes as number} min
                    </p>
                  </div>
                  {/* RTO indicator bar */}
                  <div className="w-20 shrink-0">
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={clsx('h-full rounded-full', cfg.bar ? '' : 'bg-green-400')}
                        style={{ width: `${rtoPct}%`, background: cfg.bar }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 text-right">RTO target</p>
                  </div>
                </div>
              );
            })}

            {services.length === 0 && (
              <div className="px-5 py-10 text-center text-gray-400 text-sm">
                No business services configured
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Service health pie */}
          <div className="bg-dark-900 bg-opacity-50 border border-gray-600 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Service Health Split</h3>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={2}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: unknown, name: string) => [`${v} services`, name]} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-36 flex items-center justify-center text-green-500">
                <CheckCircle size={32} />
              </div>
            )}
            <div className="flex gap-3 justify-center flex-wrap mt-1">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: d.fill }} />
                  {d.name}: {d.value}
                </div>
              ))}
            </div>
          </div>

          {/* Note about abstraction */}
          <div className="bg-dark-800 border border-blue-100 rounded-xl p-4">
            <p className="text-xs text-blue-700 font-medium mb-1">Executive View</p>
            <p className="text-xs text-blue-600">
              This view shows business service health only. Step-level operational detail is available to Silver and Bronze tier users during active recovery events.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
