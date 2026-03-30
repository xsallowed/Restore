import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, Wifi, WifiOff, Clock, Trash2, RefreshCw,
  Copy, AlertTriangle, CheckCircle, Activity, Server, Play,
  KeyRound, ChevronDown, ChevronUp,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  agent_id: string;
  name: string;
  site_name: string;
  description?: string;
  api_key_prefix: string;
  status: 'Pending' | 'Active' | 'Offline' | 'Disabled';
  version?: string;
  os_info?: string;
  ip_address?: string;
  network_cidr?: string;
  capabilities: string[];
  last_heartbeat_at?: string;
  last_job_at?: string;
  created_at: string;
}

interface AgentDetail extends Agent {
  recent_jobs: Array<{
    job_id: string;
    job_type: string;
    status: string;
    queued_at: string;
    completed_at?: string;
    result_summary?: any;
  }>;
  recent_heartbeats: Array<{
    received_at: string;
    ip_address: string;
    version: string;
    status: string;
    metrics?: any;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts?: string): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function isOffline(ts?: string): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > 90_000; // 90s
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ agent }: { agent: Agent }) {
  const offline = isOffline(agent.last_heartbeat_at);
  const effective = offline && agent.status === 'Active' ? 'Offline' : agent.status;

  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    Active:   { cls: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200',  icon: <Wifi size={11} /> },
    Offline:  { cls: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200',          icon: <WifiOff size={11} /> },
    Pending:  { cls: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-200', icon: <Clock size={11} /> },
    Disabled: { cls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',      icon: null },
  };
  const { cls, icon } = map[effective] ?? map.Disabled;

  return (
    <span className={clsx('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cls)}>
      {icon} {effective}
    </span>
  );
}

// ─── Register Modal ───────────────────────────────────────────────────────────

function RegisterAgentModal({ onClose, onRegistered }: { onClose: () => void; onRegistered: (key: string, id: string) => void }) {
  const [form, setForm] = useState({ name: '', site_name: '', description: '', network_cidr: '' });

  const mutation = useMutation({
    mutationFn: () => api.post('/api/v1/agents', form),
    onSuccess: (r) => {
      const { api_key, agent_id } = r.data.data;
      onRegistered(api_key, agent_id);
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Registration failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-xl shadow-2xl w-full max-w-lg', themeClasses.bg.card)}>
        <div className={clsx('px-6 py-4 border-b flex justify-between', themeClasses.border.primary)}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>Register New Agent</h2>
          <button onClick={onClose} className={clsx('text-xl', themeClasses.text.secondary)}>x</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Agent Name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. London Office Agent"
                className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Site Name *</label>
              <input value={form.site_name} onChange={e => setForm({ ...form, site_name: e.target.value })}
                placeholder="e.g. London Office"
                className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
            </div>
          </div>
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Network CIDR to scan</label>
            <input value={form.network_cidr} onChange={e => setForm({ ...form, network_cidr: e.target.value })}
              placeholder="e.g. 192.168.1.0/24"
              className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
          </div>
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Description</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Optional notes about this agent"
              className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
          </div>
        </div>
        <div className={clsx('px-6 py-4 border-t flex gap-3 justify-end', themeClasses.border.primary)}>
          <button onClick={onClose} className={clsx('px-4 py-2 rounded text-sm', themeClasses.button.secondary)}>Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!form.name || !form.site_name || mutation.isPending}
            className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}>
            {mutation.isPending ? 'Registering...' : 'Register Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── API Key Display Modal ─────────────────────────────────────────────────────

function ApiKeyModal({ apiKey, agentId, onClose }: { apiKey: string; agentId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const configTemplate = `{
  "AGENT_ID": "${agentId}",
  "AGENT_API_KEY": "${apiKey}",
  "CLOUD_URL": "${window.location.origin}",
  "AGENT_SITE": "My Site",
  "AGENT_NETWORK": "192.168.1.0/24"
}`;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-xl shadow-2xl w-full max-w-lg', themeClasses.bg.card)}>
        <div className={clsx('px-6 py-4 border-b', themeClasses.border.primary)}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>Agent API Key</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg border border-yellow-300 dark:border-yellow-700">
            <AlertTriangle size={16} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
              This key will not be shown again. Copy it now and save it securely.
            </p>
          </div>

          <div>
            <label className={clsx('block text-xs font-medium mb-1', themeClasses.text.secondary)}>API Key</label>
            <div className="flex gap-2">
              <code className={clsx('flex-1 px-3 py-2 rounded border text-xs font-mono break-all', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                {apiKey}
              </code>
              <button onClick={copy} className={clsx('px-3 py-2 rounded text-sm flex items-center gap-1', themeClasses.button.secondary)}>
                <Copy size={13} /> {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <label className={clsx('block text-xs font-medium mb-1', themeClasses.text.secondary)}>agent.config.json</label>
            <pre className={clsx('p-3 rounded border text-xs font-mono overflow-x-auto', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
              {configTemplate}
            </pre>
          </div>

          <div className={clsx('text-xs rounded-lg p-3 space-y-1', themeClasses.bg.secondary, themeClasses.text.secondary)}>
            <p className="font-medium">Deploy the agent:</p>
            <p>1. Copy the agent binary to the trusted machine</p>
            <p>2. Save the config above as <code className="font-mono">agent.config.json</code> next to the binary</p>
            <p>3. Run: <code className="font-mono">node agent.js</code> (or install as a service)</p>
          </div>
        </div>
        <div className={clsx('px-6 py-4 border-t flex justify-end', themeClasses.border.primary)}>
          <button onClick={onClose} className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent, onDelete, onDispatch, onRotateKey }: {
  agent: Agent;
  onDelete: (id: string) => void;
  onDispatch: (agent: Agent) => void;
  onRotateKey: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: detail } = useQuery<{ data: AgentDetail }>({
    queryKey: ['agent-detail', agent.agent_id],
    queryFn: () => api.get(`/api/v1/agents/${agent.agent_id}`).then(r => r.data),
    enabled: expanded,
  });
  const d = detail?.data;

  const offline = isOffline(agent.last_heartbeat_at);

  return (
    <div className={clsx('rounded-xl border', themeClasses.bg.card, themeClasses.border.primary)}>
      {/* Header */}
      <div className="p-4 space-y-3">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', offline ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30')}>
              <Server size={18} className={offline ? 'text-red-500' : 'text-green-600 dark:text-green-400'} />
            </div>
            <div>
              <h3 className={clsx('font-semibold text-sm', themeClasses.text.primary)}>{agent.name}</h3>
              <p className={clsx('text-xs', themeClasses.text.secondary)}>{agent.site_name}</p>
            </div>
          </div>
          <StatusBadge agent={agent} />
        </div>

        <div className={clsx('grid grid-cols-2 gap-x-4 gap-y-1 text-xs', themeClasses.text.secondary)}>
          <span>Key: <span className="font-mono">{agent.api_key_prefix}...</span></span>
          <span>IP: {agent.ip_address ?? '—'}</span>
          <span>Network: {agent.network_cidr ?? '—'}</span>
          <span>v{agent.version ?? '—'}</span>
          <span>Heartbeat: {timeAgo(agent.last_heartbeat_at)}</span>
          <span>Last job: {timeAgo(agent.last_job_at)}</span>
        </div>

        {/* Offline warning */}
        {offline && agent.status !== 'Pending' && (
          <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1.5 rounded">
            <AlertTriangle size={12} />
            Agent has not checked in for {timeAgo(agent.last_heartbeat_at)}. Results will buffer locally.
          </div>
        )}

        {agent.status === 'Pending' && (
          <div className="flex items-center gap-1.5 text-xs text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1.5 rounded">
            <Clock size={12} />
            Waiting for agent to connect — deploy the agent binary and configure it with the API key.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className={clsx('px-4 pb-3 flex gap-2 flex-wrap border-t pt-3', themeClasses.border.primary)}>
        <button onClick={() => onDispatch(agent)} disabled={agent.status === 'Disabled'}
          className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white', themeClasses.button.primary, 'disabled:opacity-40')}>
          <Play size={12} /> Dispatch Scan
        </button>
        <button onClick={() => onRotateKey(agent.agent_id)}
          className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded text-xs', themeClasses.button.secondary)}>
          <KeyRound size={12} /> Rotate Key
        </button>
        <button onClick={() => setExpanded(!expanded)}
          className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded text-xs', themeClasses.button.secondary)}>
          <Activity size={12} /> {expanded ? 'Hide' : 'Details'}
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        <button onClick={() => { if (window.confirm('Delete this agent?')) onDelete(agent.agent_id); }}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs text-red-600 bg-red-50 dark:bg-red-900/30 ml-auto">
          <Trash2 size={12} />
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && d && (
        <div className={clsx('border-t px-4 py-4 space-y-4', themeClasses.border.primary)}>
          {/* Recent jobs */}
          <div>
            <p className={clsx('text-xs font-medium uppercase tracking-wide mb-2', themeClasses.text.secondary)}>Recent Jobs</p>
            {d.recent_jobs.length === 0 ? (
              <p className={clsx('text-xs', themeClasses.text.secondary)}>No jobs yet</p>
            ) : (
              <div className="space-y-1.5">
                {d.recent_jobs.slice(0, 5).map(j => (
                  <div key={j.job_id} className={clsx('flex items-center justify-between text-xs px-3 py-2 rounded', themeClasses.bg.secondary)}>
                    <span className={clsx('font-medium', themeClasses.text.primary)}>{j.job_type}</span>
                    <span className={clsx(themeClasses.text.secondary)}>{new Date(j.queued_at).toLocaleDateString()}</span>
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs',
                      j.status === 'Complete' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200'
                        : j.status === 'Failed' ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200'
                        : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200')}>
                      {j.status}
                    </span>
                    {j.result_summary && (
                      <span className={clsx(themeClasses.text.secondary)}>
                        {j.result_summary.hosts_up ?? 0} up / {j.result_summary.hosts_down ?? 0} down
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent heartbeats */}
          <div>
            <p className={clsx('text-xs font-medium uppercase tracking-wide mb-2', themeClasses.text.secondary)}>Recent Heartbeats</p>
            <div className="flex gap-1.5 flex-wrap">
              {d.recent_heartbeats.map((h, i) => (
                <div key={i} title={`${new Date(h.received_at).toLocaleTimeString()} — ${h.status}`}
                  className={clsx('w-3 h-3 rounded-full',
                    h.status === 'idle' ? 'bg-green-400' : h.status === 'running' ? 'bg-blue-400' : 'bg-red-400')} />
              ))}
              {d.recent_heartbeats.length === 0 && <p className={clsx('text-xs', themeClasses.text.secondary)}>No heartbeats recorded yet</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dispatch Modal ───────────────────────────────────────────────────────────

function DispatchModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [form, setForm] = useState({
    scan_type: 'ICMP',
    target_type: 'CIDR',
    target_value: agent.network_cidr ?? '',
    timing: 'Normal',
    port_preset: 'top20',
  });

  const mutation = useMutation({
    mutationFn: () => api.post(`/api/v1/agents/${agent.agent_id}/dispatch`, {
      job_type: 'active_scan',
      payload: {
        scan_type: form.scan_type,
        target_type: form.target_type,
        target_spec: { type: form.target_type, value: form.target_value },
        port_config: { preset: form.port_preset },
        timing: form.timing,
      },
    }),
    onSuccess: () => { toast.success('Scan dispatched to agent'); onClose(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Dispatch failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-xl shadow-xl w-full max-w-md', themeClasses.bg.card)}>
        <div className={clsx('px-6 py-4 border-b flex justify-between', themeClasses.border.primary)}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>Dispatch Scan to {agent.name}</h2>
          <button onClick={onClose} className={clsx('text-xl', themeClasses.text.secondary)}>x</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Scan Type</label>
              <select value={form.scan_type} onChange={e => setForm({ ...form, scan_type: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                {['ICMP', 'TCP', 'FULL_DISCOVERY', 'NMAP', 'SNMP', 'HTTP'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Target Type</label>
              <select value={form.target_type} onChange={e => setForm({ ...form, target_type: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                {['SINGLE_IP', 'IP_RANGE', 'CIDR', 'ALL_ACTIVE'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Target</label>
            <input value={form.target_value} onChange={e => setForm({ ...form, target_value: e.target.value })}
              placeholder="192.168.1.0/24 or 192.168.1.1"
              className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Speed</label>
              <select value={form.timing} onChange={e => setForm({ ...form, timing: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                {['Slow', 'Normal', 'Fast'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Port Preset</label>
              <select value={form.port_preset} onChange={e => setForm({ ...form, port_preset: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                <option value="top20">Top 20</option>
                <option value="top100">Top 100</option>
                <option value="all">All ports</option>
              </select>
            </div>
          </div>
        </div>
        <div className={clsx('px-6 py-4 border-t flex gap-3 justify-end', themeClasses.border.primary)}>
          <button onClick={onClose} className={clsx('px-4 py-2 rounded text-sm', themeClasses.button.secondary)}>Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}>
            {mutation.isPending ? 'Dispatching...' : 'Dispatch Scan'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AgentsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [newApiKey, setNewApiKey] = useState<{ key: string; id: string } | null>(null);
  const [dispatchAgent, setDispatchAgent] = useState<Agent | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => api.get('/api/v1/agents').then(r => r.data.data || []),
    refetchInterval: 30_000,
  });
  const agents: Agent[] = data || [];
  const activeCount = agents.filter(a => !isOffline(a.last_heartbeat_at) && a.status === 'Active').length;
  const offlineCount = agents.filter(a => isOffline(a.last_heartbeat_at) && a.status !== 'Pending').length;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/agents/${id}`),
    onSuccess: () => { toast.success('Agent deleted'); queryClient.invalidateQueries({ queryKey: ['agents'] }); },
  });

  const rotateKeyMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/agents/${id}/rotate-key`),
    onSuccess: (r) => setNewApiKey({ key: r.data.data.api_key, id: r.data.data.agent_id ?? '' }),
    onError: () => toast.error('Key rotation failed'),
  });

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-6xl mx-auto space-y-6">
        <button onClick={() => navigate('/assets')} className={clsx('flex items-center gap-2', themeClasses.text.primary, 'hover:opacity-70')}>
          <ArrowLeft size={20} /> Back to Assets
        </button>

        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className={clsx('text-3xl font-bold mb-1', themeClasses.text.primary)}>Remote Agents</h1>
            <p className={clsx('text-sm', themeClasses.text.secondary)}>
              Deploy agents on trusted machines to discover assets on remote or air-gapped networks
            </p>
          </div>
          <button onClick={() => setShowRegister(true)}
            className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}>
            <Plus size={18} /> Register Agent
          </button>
        </div>

        {/* Summary bar */}
        {agents.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Agents', value: agents.length, color: '' },
              { label: 'Active', value: activeCount, color: 'text-green-600 dark:text-green-400' },
              { label: 'Offline', value: offlineCount, color: offlineCount > 0 ? 'text-red-600 dark:text-red-400' : '' },
            ].map(c => (
              <div key={c.label} className={clsx('rounded-xl border p-4 text-center', themeClasses.bg.card, themeClasses.border.primary)}>
                <p className={clsx('text-2xl font-bold', c.color || themeClasses.text.primary)}>{c.value}</p>
                <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>{c.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* How it works (shown when empty) */}
        {agents.length === 0 && !isLoading && (
          <div className={clsx('rounded-xl border p-8', themeClasses.bg.card, themeClasses.border.primary)}>
            <div className="max-w-2xl mx-auto text-center space-y-4">
              <Server size={40} className={clsx('mx-auto opacity-30', themeClasses.text.secondary)} />
              <h2 className={clsx('text-xl font-semibold', themeClasses.text.primary)}>No agents deployed yet</h2>
              <p className={clsx('text-sm', themeClasses.text.secondary)}>
                Agents let you discover assets on networks this cloud platform cannot reach directly —
                remote offices, factory floors, air-gapped segments, or any network behind a firewall.
              </p>
              <div className="grid grid-cols-3 gap-4 text-left mt-6">
                {[
                  { step: '1', title: 'Register', desc: 'Click Register Agent to generate credentials' },
                  { step: '2', title: 'Deploy', desc: 'Copy the agent binary and config to a trusted machine on that network' },
                  { step: '3', title: 'Discover', desc: 'Dispatch scans from here — the agent runs them locally and sends results back' },
                ].map(s => (
                  <div key={s.step} className={clsx('rounded-lg p-4', themeClasses.bg.secondary)}>
                    <div className="text-2xl font-bold text-blue-500 mb-2">{s.step}</div>
                    <p className={clsx('font-medium text-sm mb-1', themeClasses.text.primary)}>{s.title}</p>
                    <p className={clsx('text-xs', themeClasses.text.secondary)}>{s.desc}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowRegister(true)}
                className={clsx('mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}>
                <Plus size={18} /> Register First Agent
              </button>
            </div>
          </div>
        )}

        {/* Agent cards */}
        {isLoading ? (
          <p className={clsx('text-center py-12', themeClasses.text.secondary)}>Loading agents...</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map(agent => (
              <AgentCard key={agent.agent_id} agent={agent}
                onDelete={id => deleteMutation.mutate(id)}
                onDispatch={a => setDispatchAgent(a)}
                onRotateKey={id => rotateKeyMutation.mutate(id)} />
            ))}
          </div>
        )}
      </div>

      {showRegister && (
        <RegisterAgentModal
          onClose={() => setShowRegister(false)}
          onRegistered={(key, id) => setNewApiKey({ key, id })} />
      )}

      {newApiKey && (
        <ApiKeyModal apiKey={newApiKey.key} agentId={newApiKey.id}
          onClose={() => { setNewApiKey(null); queryClient.invalidateQueries({ queryKey: ['agents'] }); }} />
      )}

      {dispatchAgent && (
        <DispatchModal agent={dispatchAgent} onClose={() => setDispatchAgent(null)} />
      )}
    </div>
  );
}
