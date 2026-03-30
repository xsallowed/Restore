import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Play, XCircle, Download, Eye, RefreshCw,
  CheckCircle, AlertCircle, Clock, Wifi, WifiOff, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface Scan {
  scan_id: string;
  name: string;
  scan_type: string;
  target_type: string;
  target_spec: any;
  status: string;
  started_at?: string;
  completed_at?: string;
  total_hosts: number;
  hosts_up: number;
  hosts_down: number;
  new_discovered: number;
  error_message?: string;
  created_at: string;
}

interface ScanResult {
  result_id: string;
  target_ip: string;
  hostname?: string;
  mac_address?: string;
  status: 'Online' | 'Offline' | 'Filtered';
  latency_ms?: number;
  open_ports?: Array<{ port: number; service?: string; banner?: string }>;
  os_fingerprint?: { name: string; accuracy: number };
  confidence_score: number;
  matched_asset_id?: string;
  is_new_discovery: boolean;
}

interface ProgressLog {
  message: string;
  status: string;
  hosts_completed?: number;
  hosts_total?: number;
  timestamp: string;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Queued: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300',
    Running: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200',
    Complete: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200',
    Failed: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200',
    Cancelled: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-200',
  };
  return <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', map[status] || map.Queued)}>{status}</span>;
}

function duration(start?: string, end?: string): string {
  if (!start) return '—';
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const sec = Math.floor((e.getTime() - s.getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

// ─── Scan Detail Modal ────────────────────────────────────────────────────────

function ScanDetailModal({ scan, onClose }: { scan: Scan; onClose: () => void }) {
  const [filter, setFilter] = useState<'all' | 'online' | 'offline' | 'new' | 'ports'>('all');
  const queryClient = useQueryClient();

  const { data: resultsData, isLoading } = useQuery({
    queryKey: ['scan-results', scan.scan_id],
    queryFn: () => api.get(`/api/v1/scans/${scan.scan_id}/results`).then((r) => r.data.data || []),
    refetchInterval: scan.status === 'Running' ? 3000 : false,
  });

  const { data: progressData } = useQuery({
    queryKey: ['scan-progress', scan.scan_id],
    queryFn: () => api.get(`/api/v1/scans/${scan.scan_id}/progress`).then((r) => r.data.data || []),
    refetchInterval: scan.status === 'Running' ? 2000 : false,
    enabled: scan.status === 'Running',
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/scans/${scan.scan_id}/cancel`),
    onSuccess: () => { toast.success('Scan cancelled'); queryClient.invalidateQueries({ queryKey: ['scans'] }); },
  });

  const results: ScanResult[] = resultsData || [];
  const progress: ProgressLog[] = progressData || [];

  const filtered = results.filter((r) => {
    if (filter === 'online') return r.status === 'Online';
    if (filter === 'offline') return r.status === 'Offline';
    if (filter === 'new') return r.is_new_discovery;
    if (filter === 'ports') return r.open_ports && r.open_ports.length > 0;
    return true;
  });

  const exportCSV = () => {
    const rows = results.map((r) =>
      [r.target_ip, r.hostname || '', r.status, r.latency_ms ?? '', r.mac_address || '',
        r.open_ports?.map((p) => `${p.port}/${p.service}`).join(';') || '',
        r.os_fingerprint?.name || '', r.confidence_score, r.is_new_discovery].join(',')
    );
    const csv = ['IP,Hostname,Status,Latency(ms),MAC,Open Ports,OS,Confidence,New Discovery', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `scan-${scan.scan_id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const latestProgress = progress[progress.length - 1];
  const progressPct = latestProgress?.hosts_total
    ? Math.round(((latestProgress.hosts_completed ?? 0) / latestProgress.hosts_total) * 100)
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col', themeClasses.bg.card)}>
        <div className={clsx('px-6 py-4 border-b flex justify-between items-center', themeClasses.border.primary)}>
          <div>
            <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>{scan.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <StatusBadge status={scan.status} />
              <span className={clsx('text-xs', themeClasses.text.secondary)}>{scan.scan_type} · {duration(scan.started_at, scan.completed_at)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {scan.status === 'Running' && (
              <button onClick={() => cancelMutation.mutate()}
                className="flex items-center gap-1.5 px-3 py-2 rounded text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100">
                <XCircle size={14} /> Cancel
              </button>
            )}
            <button onClick={exportCSV} className={clsx('flex items-center gap-1.5 px-3 py-2 rounded text-sm', themeClasses.button.secondary)}>
              <Download size={14} /> Export CSV
            </button>
            <button onClick={onClose} className={clsx('text-xl', themeClasses.text.secondary)}>✕</button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Live progress */}
          {scan.status === 'Running' && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className={clsx('flex items-center gap-1.5', themeClasses.text.secondary)}>
                  <RefreshCw size={12} className="animate-spin" /> Scanning…
                </span>
                <span className={clsx(themeClasses.text.secondary)}>{progressPct}%</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              {latestProgress && (
                <p className={clsx('text-xs', themeClasses.text.secondary)}>{latestProgress.message}</p>
              )}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total', value: scan.total_hosts, icon: null, color: '' },
              { label: 'Online', value: scan.hosts_up, icon: <Wifi size={14} />, color: 'text-green-600 dark:text-green-400' },
              { label: 'Offline', value: scan.hosts_down, icon: <WifiOff size={14} />, color: 'text-red-600 dark:text-red-400' },
              { label: 'New Discovered', value: scan.new_discovered, icon: <Plus size={14} />, color: 'text-blue-600 dark:text-blue-400' },
            ].map((c) => (
              <div key={c.label} className={clsx('rounded-lg p-3 text-center', themeClasses.bg.secondary)}>
                <div className={clsx('flex items-center justify-center gap-1 mb-1', c.color || themeClasses.text.secondary)}>
                  {c.icon}
                  <span className={clsx('text-xl font-bold', c.color || themeClasses.text.primary)}>{c.value}</span>
                </div>
                <p className={clsx('text-xs', themeClasses.text.secondary)}>{c.label}</p>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {(['all', 'online', 'offline', 'new', 'ports'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={clsx('px-3 py-1.5 rounded text-xs font-medium capitalize',
                  filter === f ? 'bg-blue-600 text-white' : clsx(themeClasses.button.secondary, themeClasses.text.secondary))}>
                {f === 'ports' ? 'Has Open Ports' : f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'all' && ` (${results.length})`}
                {f === 'online' && ` (${results.filter((r) => r.status === 'Online').length})`}
                {f === 'offline' && ` (${results.filter((r) => r.status === 'Offline').length})`}
                {f === 'new' && ` (${results.filter((r) => r.is_new_discovery).length})`}
                {f === 'ports' && ` (${results.filter((r) => r.open_ports?.length).length})`}
              </button>
            ))}
          </div>

          {/* Results table */}
          {isLoading ? (
            <p className={clsx('text-center py-8', themeClasses.text.secondary)}>Loading results…</p>
          ) : filtered.length === 0 ? (
            <p className={clsx('text-center py-8', themeClasses.text.secondary)}>No results match this filter</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className={clsx('text-xs font-medium uppercase tracking-wide', themeClasses.text.secondary, 'bg-gray-50 dark:bg-gray-800/50')}>
                  <tr>
                    <th className="px-4 py-3 text-left">IP</th>
                    <th className="px-4 py-3 text-left">Hostname</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Latency</th>
                    <th className="px-4 py-3 text-left">Open Ports</th>
                    <th className="px-4 py-3 text-left">OS</th>
                    <th className="px-4 py-3 text-left">Score</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.result_id} className={clsx('border-t border-gray-100 dark:border-gray-800', themeClasses.text.primary)}>
                      <td className="px-4 py-2 font-mono text-xs">
                        {r.target_ip}
                        {r.is_new_discovery && (
                          <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 text-xs rounded">New</span>
                        )}
                      </td>
                      <td className={clsx('px-4 py-2 text-xs', themeClasses.text.secondary)}>{r.hostname || '—'}</td>
                      <td className="px-4 py-2">
                        <span className={clsx('flex items-center gap-1 text-xs',
                          r.status === 'Online' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                          {r.status === 'Online' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                          {r.status}
                        </span>
                      </td>
                      <td className={clsx('px-4 py-2 text-xs', themeClasses.text.secondary)}>
                        {r.latency_ms != null ? `${r.latency_ms}ms` : '—'}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {r.open_ports?.length ? (
                          <span title={r.open_ports.map((p) => `${p.port}/${p.service}`).join(', ')}>
                            {r.open_ports.slice(0, 3).map((p) => p.port).join(', ')}
                            {r.open_ports.length > 3 && ` +${r.open_ports.length - 3}`}
                          </span>
                        ) : '—'}
                      </td>
                      <td className={clsx('px-4 py-2 text-xs', themeClasses.text.secondary)}>
                        {r.os_fingerprint ? `${r.os_fingerprint.name} (${r.os_fingerprint.accuracy}%)` : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div className={clsx('h-full rounded-full', r.confidence_score >= 70 ? 'bg-green-500' : r.confidence_score >= 40 ? 'bg-yellow-500' : 'bg-red-500')}
                              style={{ width: `${r.confidence_score}%` }} />
                          </div>
                          <span className={clsx('text-xs', themeClasses.text.secondary)}>{r.confidence_score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1">
                          {r.matched_asset_id ? (
                            <a href={`/assets/${r.matched_asset_id}`}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
                              <Eye size={11} /> View
                            </a>
                          ) : r.is_new_discovery && (
                            <button className="text-xs text-green-600 dark:text-green-400 hover:underline">Add</button>
                          )}
                        </div>
                      </td>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ScanResultsPage() {
  const navigate = useNavigate();
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);
  const queryClient = useQueryClient();

  const { data: scansData, isLoading } = useQuery({
    queryKey: ['scans'],
    queryFn: () => api.get('/api/v1/scans').then((r) => r.data.data || []),
    refetchInterval: 10_000,
  });
  const scans: Scan[] = scansData || [];

  const runMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/scans/${id}/run`),
    onSuccess: (_, id) => {
      toast.success('Scan started');
      queryClient.invalidateQueries({ queryKey: ['scans'] });
      const scan = scans.find((s) => s.scan_id === id);
      if (scan) setSelectedScan({ ...scan, status: 'Running' });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to start scan'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/scans/${id}`),
    onSuccess: () => { toast.success('Scan deleted'); queryClient.invalidateQueries({ queryKey: ['scans'] }); },
  });

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-7xl mx-auto space-y-6">
        <button onClick={() => navigate('/assets/scan')} className={clsx('flex items-center gap-2', themeClasses.text.primary, 'hover:opacity-70')}>
          <ArrowLeft size={20} /> Back to Scan Config
        </button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className={clsx('text-3xl font-bold mb-1', themeClasses.text.primary)}>Scan Results</h1>
            <p className={clsx('text-sm', themeClasses.text.secondary)}>View and manage all network scan jobs</p>
          </div>
          <button onClick={() => navigate('/assets/scan')}
            className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}>
            <Plus size={18} /> New Scan
          </button>
        </div>

        {isLoading ? (
          <div className={clsx('text-center py-12', themeClasses.text.secondary)}>Loading scans…</div>
        ) : scans.length === 0 ? (
          <div className={clsx('rounded-xl p-12 text-center border', themeClasses.bg.card, themeClasses.border.primary)}>
            <Clock size={40} className={clsx('mx-auto mb-4 opacity-30', themeClasses.text.secondary)} />
            <p className={clsx('text-lg font-medium mb-2', themeClasses.text.primary)}>No scans yet</p>
            <p className={clsx('text-sm mb-6', themeClasses.text.secondary)}>Configure and run your first network scan</p>
            <button onClick={() => navigate('/assets/scan')}
              className={clsx('inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}>
              <Plus size={18} /> New Scan
            </button>
          </div>
        ) : (
          <div className={clsx('rounded-xl border overflow-hidden', themeClasses.bg.card, themeClasses.border.primary)}>
            <table className="w-full text-sm">
              <thead className={clsx('text-xs font-medium uppercase tracking-wide', themeClasses.text.secondary, 'bg-gray-50 dark:bg-gray-800/50')}>
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Started</th>
                  <th className="px-4 py-3 text-left">Duration</th>
                  <th className="px-4 py-3 text-left">Up / Down</th>
                  <th className="px-4 py-3 text-left">New</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan.scan_id} className={clsx('border-t border-gray-100 dark:border-gray-800', themeClasses.text.primary)}>
                    <td className="px-4 py-3 font-medium">{scan.name}</td>
                    <td className={clsx('px-4 py-3 text-xs', themeClasses.text.secondary)}>{scan.scan_type}</td>
                    <td className="px-4 py-3"><StatusBadge status={scan.status} /></td>
                    <td className={clsx('px-4 py-3 text-xs', themeClasses.text.secondary)}>
                      {scan.started_at ? new Date(scan.started_at).toLocaleString() : '—'}
                    </td>
                    <td className={clsx('px-4 py-3 text-xs', themeClasses.text.secondary)}>{duration(scan.started_at, scan.completed_at)}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="text-green-600 dark:text-green-400">{scan.hosts_up}</span>
                      {' / '}
                      <span className="text-red-500 dark:text-red-400">{scan.hosts_down}</span>
                    </td>
                    <td className={clsx('px-4 py-3 text-xs', scan.new_discovered > 0 ? 'text-blue-600 dark:text-blue-400 font-medium' : themeClasses.text.secondary)}>
                      {scan.new_discovered}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {(scan.status === 'Complete' || scan.status === 'Running') && (
                          <button onClick={() => setSelectedScan(scan)}
                            className={clsx('flex items-center gap-1 px-2 py-1 rounded text-xs', themeClasses.button.secondary)}>
                            <Eye size={12} /> Results
                          </button>
                        )}
                        {scan.status === 'Queued' && (
                          <button onClick={() => runMutation.mutate(scan.scan_id)}
                            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200">
                            <Play size={12} /> Run
                          </button>
                        )}
                        {scan.status === 'Complete' && (
                          <button onClick={() => runMutation.mutate(scan.scan_id)}
                            className={clsx('flex items-center gap-1 px-2 py-1 rounded text-xs', themeClasses.button.secondary)}>
                            <RefreshCw size={12} /> Re-run
                          </button>
                        )}
                        <button onClick={() => { if (window.confirm('Delete this scan?')) deleteMutation.mutate(scan.scan_id); }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-600 bg-red-50 dark:bg-red-900/30">
                          <XCircle size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedScan && <ScanDetailModal scan={selectedScan} onClose={() => setSelectedScan(null)} />}
    </div>
  );
}
