// ── RehearsalPage ─────────────────────────────────────────────────────────────
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { rehearsalsApi } from '../../lib/api';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Play, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { themeClasses } from '../../lib/themeClasses';

const schema = z.object({
  name: z.string().min(3, 'Name required'),
  eventType: z.string().min(1, 'Event type required'),
  scheduledAt: z.string().optional(),
});
type Form = z.infer<typeof schema>;

const EVENT_TYPES = [
  'RANSOMWARE', 'DDoS', 'DATA_EXFILTRATION', 'INFRASTRUCTURE_FAILURE',
  'DATABASE_CORRUPTION', 'NETWORK_DISRUPTION', 'DR_ACTIVATION', 'MAJOR_INCIDENT',
];

export function RehearsalPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const createMutation = useMutation({
    mutationFn: (data: Form) => rehearsalsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rehearsals'] }); reset(); toast.success('Rehearsal scheduled'); },
    onError: () => toast.error('Failed to create rehearsal'),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => rehearsalsApi.start(id),
    onSuccess: (res) => {
      toast.success('Rehearsal started');
      navigate(`/events/${res.data.data.event.id}?rehearsal=true`);
    },
    onError: () => toast.error('Failed to start rehearsal'),
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dress Rehearsals</h1>
        <p className={clsx(themeClasses.text.secondary, 'text-sm mt-0.5')}>Practice recovery procedures in a sandboxed environment — no live systems affected</p>
      </div>

      <div className={clsx(themeClasses.card, 'border-amber-300 dark:border-amber-200 rounded-xl p-4 flex items-start gap-3')}>
        <Play size={18} className="text-yellow-500 dark:text-yellow-400 shrink-0 mt-0.5" />
        <div className={clsx(themeClasses.text.secondary, 'text-sm')}>
          <p className={clsx(themeClasses.text.primary, 'font-medium mb-1')}>Rehearsal Mode</p>
          <p>All SOAR automation is mocked, notifications are sandboxed, and no live tickets are created. Evidence and step completions are recorded for the Assessment Report.</p>
        </div>
      </div>

      {/* Create form */}
      <div className={clsx(themeClasses.card, 'border-gray-300 dark:border-gray-700 rounded-xl p-5')}>
        <h2 className={clsx(themeClasses.text.primary, 'font-semibold mb-4')}>Schedule New Rehearsal</h2>
        <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx(themeClasses.text.secondary, 'block text-sm font-medium mb-1')}>Rehearsal name</label>
              <input {...register('name')} placeholder="Q1 Ransomware Drill" className={clsx(themeClasses.input, 'w-full rounded-lg px-3 py-2 text-sm')} />
              {errors.name && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className={clsx(themeClasses.text.secondary, 'block text-sm font-medium mb-1')}>Event type to simulate</label>
              <select {...register('eventType')} className={clsx(themeClasses.input, 'w-full rounded-lg px-3 py-2 text-sm')}>
                <option value="">Select…</option>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
              {errors.eventType && <p className="text-red-600 dark:text-red-400 text-xs mt-1">{errors.eventType.message}</p>}
            </div>
          </div>
          <div>
            <label className={clsx(themeClasses.text.secondary, 'block text-sm font-medium mb-1')}>Scheduled date/time (optional)</label>
            <input type="datetime-local" {...register('scheduledAt')} className={clsx(themeClasses.input, 'w-full rounded-lg px-3 py-2 text-sm')} />
          </div>
          <button type="submit" disabled={isSubmitting} className={clsx(themeClasses.button.primary, 'text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50')}>
            Schedule Rehearsal
          </button>
        </form>
      </div>
    </div>
  );
}

// ── AssetRegistryPage ─────────────────────────────────────────────────────────
import { assetsApi } from '../../lib/api';

export function AssetRegistryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['assets'],
    queryFn: () => assetsApi.list().then(r => r.data.data),
  });

  const assets: Record<string, unknown>[] = (data as Record<string, unknown>[]) ?? [];

  const STATUS_COLOR: Record<string, string> = {
    HEALTHY: 'bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-200',
    DEGRADED: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-900 dark:text-yellow-200',
    CRITICAL: 'bg-orange-100 dark:bg-orange-900/40 text-orange-900 dark:text-orange-200',
    OFFLINE: 'bg-red-100 dark:bg-red-900/40 text-red-900 dark:text-red-200',
    UNKNOWN: 'bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-200',
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Technology Asset Registry</h1>
          <p className={clsx(themeClasses.text.secondary, 'text-sm mt-0.5')}>{assets.length} assets registered</p>
        </div>
      </div>

      {isLoading ? (
        <div className={clsx(themeClasses.text.primary, 'flex items-center justify-center h-40 text-sm')}>Loading assets…</div>
      ) : (
        <div className={clsx(themeClasses.card, 'border-gray-300 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm dark:shadow-md')}>
          <table className="w-full text-sm">
            <thead>
              <tr className={clsx(themeClasses.bg.tertiary, 'border-b border-gray-300 dark:border-gray-700 text-left')}>
                {['Asset', 'Type', 'Environment', 'Tier', 'Status', 'Business Services'].map(h => (
                  <th key={h} className={clsx(themeClasses.text.secondary, 'px-4 py-3 text-xs font-semibold uppercase tracking-wide')}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className={clsx('divide-y divide-gray-300 dark:divide-gray-700')}>
              {assets.map(asset => (
                <tr key={asset.id as string} className={clsx(themeClasses.hover.bg, 'transition-colors')}>
                  <td className={clsx(themeClasses.text.primary, 'px-4 py-3 font-medium')}>{asset.name as string}</td>
                  <td className={clsx(themeClasses.text.secondary, 'px-4 py-3 text-xs')}>{asset.asset_type as string}</td>
                  <td className="px-4 py-3 text-xs"><span className={clsx(themeClasses.bg.tertiary, themeClasses.text.secondary, 'px-1.5 py-0.5 rounded')}>{asset.environment as string}</span></td>
                  <td className={clsx(themeClasses.text.secondary, 'px-4 py-3 text-center text-xs font-bold')}>T{asset.criticality_tier as number}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', STATUS_COLOR[asset.status as string] ?? STATUS_COLOR.UNKNOWN)}>
                      {asset.status as string}
                    </span>
                  </td>
                  <td className={clsx(themeClasses.text.secondary, 'px-4 py-3 text-xs')}>
                    {(asset.business_services as string[])?.filter(Boolean).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {assets.length === 0 && (
            <div className={clsx(themeClasses.text.secondary, 'px-4 py-12 text-center text-sm')}>No assets registered — add assets via API or import from CMDB</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ConnectorsPage ─────────────────────────────────────────────────────────────
import { connectorsApi } from '../../lib/api';

export function ConnectorsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['connectors'],
    queryFn: () => connectorsApi.list().then(r => r.data.data),
  });

  const ingestMutation = useMutation({
    mutationFn: (id: string) => connectorsApi.ingest(id),
    onSuccess: () => { toast.success('Sync queued'); qc.invalidateQueries({ queryKey: ['connectors'] }); },
    onError: () => toast.error('Failed to queue sync'),
  });

  const connectors: Record<string, unknown>[] = (data as Record<string, unknown>[]) ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Runbook Connectors</h1>
        <p className={clsx(themeClasses.text.secondary, 'text-sm mt-0.5')}>Source integrations for runbooks and playbooks</p>
      </div>

      {isLoading ? (
        <div className={clsx(themeClasses.text.primary, 'flex items-center justify-center h-40 text-sm')}>Loading…</div>
      ) : (
        <div className="space-y-3">
          {connectors.map(c => (
            <div key={c.id as string} className={clsx(themeClasses.card, 'border-gray-300 dark:border-gray-700 rounded-xl p-4 flex items-center gap-4 shadow-sm dark:shadow-md')}>
              <div className="flex-1">
                <p className={clsx(themeClasses.text.primary, 'font-medium')}>{c.name as string}</p>
                <p className={clsx(themeClasses.text.secondary, 'text-xs mt-0.5')}>
                  {c.connector_type as string} ·
                  Last synced: {c.last_synced_at ? formatDistanceToNow(new Date(c.last_synced_at as string), { addSuffix: true }) : 'Never'}
                </p>
              </div>
              <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full',
                c.last_sync_status === 'OK' ? 'bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-200' :
                c.last_sync_status === 'ERROR' ? 'bg-red-100 dark:bg-red-900/40 text-red-900 dark:text-red-200' :
                'bg-gray-300 dark:bg-gray-700 text-gray-900 dark:text-gray-200'
              )}>
                {c.last_sync_status as string ?? 'Never synced'}
              </span>
              <button
                onClick={() => ingestMutation.mutate(c.id as string)}
                disabled={ingestMutation.isPending}
                className={clsx(themeClasses.button.secondary, 'text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-50')}
              >
                Sync now
              </button>
            </div>
          ))}
          {connectors.length === 0 && (
            <div className={clsx(themeClasses.card, 'border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center text-sm shadow-sm dark:shadow-md')}>
              <p className={themeClasses.text.secondary}>No connectors configured — add connectors via the API</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
