import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, Play, Edit2, Trash2, CheckCircle, XCircle,
  AlertCircle, Clock, ChevronDown, ChevronUp, Download, RefreshCw,
  AlertTriangle, Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Connector {
  id: string;
  connector_id: string;
  name: string;
  type: string;
  base_url: string;
  auth_type: string;
  endpoint: string;
  pagination_type: string;
  response_root_key: string;
  schedule: string;
  is_enabled: boolean;
  sync_status?: string;
  last_sync?: string;
  next_sync?: string;
  consecutive_failures?: number;
  field_map?: Record<string, string>;
}

interface TestStep {
  step: number;
  name: string;
  status: 'passed' | 'failed' | 'warning' | 'skipped' | 'running';
  summary: string;
  warnings?: string[];
  errors?: string[];
  preview?: any[];
  rawSample?: string;
}

interface DryRunResult {
  total_fetched: number;
  to_create: number;
  to_update: number;
  to_skip: number;
  mapping_errors: number;
  preview: Array<{
    source_identifier: string;
    match_status: string;
    action: string;
    fields_mapped: number;
    warnings: string[];
  }>;
}

interface HealthData {
  health_status: 'green' | 'amber' | 'red' | 'gray';
  consecutive_failures: number;
  is_enabled: boolean;
  last_failure_at?: string;
  recent_syncs: Array<{ status: string; records_fetched: number; sync_started_at: string }>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const REGISTRY_FIELDS = [
  'asset_name', 'asset_type', 'hostname', 'ip_address', 'mac_address',
  'os_name', 'os_version', 'serial_number', 'manufacturer', 'model',
  'owner_email', 'owner_name', 'owner_team', 'location', 'status', 'last_seen', 'tags', 'notes',
];

const CONNECTOR_TYPES = [
  { value: 'generic', label: 'Generic REST' },
  { value: 'intune', label: 'Microsoft Intune' },
  { value: 'servicenow', label: 'ServiceNow CMDB' },
  { value: 'crowdstrike', label: 'CrowdStrike Falcon' },
  { value: 'tenable', label: 'Tenable.io' },
  { value: 'jamf', label: 'Jamf Pro' },
  { value: 'qualys', label: 'Qualys' },
];

const PRESET_CONFIGS: Record<string, Partial<typeof DEFAULT_FORM>> = {
  intune: {
    base_url: 'https://graph.microsoft.com/v1.0',
    auth_type: 'OAuth2',
    endpoint: '/deviceManagement/managedDevices',
    pagination_type: 'Cursor / nextLink',
    response_root_key: 'value',
  },
  servicenow: {
    base_url: 'https://{instance}.service-now.com',
    auth_type: 'Basic Auth',
    endpoint: '/api/now/table/cmdb_ci_computer',
    pagination_type: 'Offset-Limit',
    response_root_key: 'result',
  },
  crowdstrike: {
    base_url: 'https://api.crowdstrike.com',
    auth_type: 'OAuth2',
    endpoint: '/devices/queries/devices/v1',
    pagination_type: 'Cursor / nextLink',
  },
  tenable: {
    base_url: 'https://cloud.tenable.com',
    auth_type: 'API Key',
    endpoint: '/assets',
    pagination_type: 'Cursor / nextLink',
    response_root_key: 'assets',
  },
  jamf: {
    base_url: 'https://{instance}.jamfcloud.com',
    auth_type: 'Bearer Token',
    endpoint: '/api/v1/computers-preview',
    pagination_type: 'Page Number',
    response_root_key: 'results',
  },
};

const DEFAULT_FORM = {
  name: '',
  type: 'generic',
  base_url: '',
  auth_type: 'None',
  endpoint: '',
  pagination_type: 'None',
  response_root_key: '',
  schedule: 'Manual',
  is_enabled: true,
  auth_config: {} as Record<string, string>,
  field_map: {} as Record<string, string>,
};

// ─── Step Icon ───────────────────────────────────────────────────────────────

function StepIcon({ status }: { status: TestStep['status'] }) {
  if (status === 'passed') return <CheckCircle size={18} className="text-green-500" />;
  if (status === 'failed') return <XCircle size={18} className="text-red-500" />;
  if (status === 'warning') return <AlertCircle size={18} className="text-yellow-500" />;
  if (status === 'skipped') return <Clock size={18} className="text-gray-400" />;
  return <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />;
}

// ─── Test Results Stepper ─────────────────────────────────────────────────────

function TestResultsStepper({ steps, overall, onDryRun, onSave, onSync, isSaved }: {
  steps: TestStep[];
  overall: 'passed' | 'failed' | 'warning';
  onDryRun: () => void;
  onSave: () => void;
  onSync: () => void;
  isSaved: boolean;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const bannerClasses = {
    passed: 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200',
    warning: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200',
    failed: 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200',
  };

  const bannerText = {
    passed: '✓ All checks passed — connector is ready to sync',
    warning: '⚠ Checks passed with warnings — review before syncing',
    failed: '✗ Validation failed — fix errors before syncing',
  };

  return (
    <div className="space-y-3">
      {/* Overall banner */}
      <div className={clsx('px-4 py-3 rounded-lg border text-sm font-medium', bannerClasses[overall])}>
        {bannerText[overall]}
      </div>

      {/* Steps */}
      <div className={clsx('rounded-lg border overflow-hidden', themeClasses.border.primary)}>
        {steps.map((step, idx) => (
          <div key={step.step} className={clsx('border-b last:border-b-0', themeClasses.border.primary)}>
            <button
              className={clsx('w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-80 transition', themeClasses.bg.card)}
              onClick={() => setExpanded(expanded === idx ? null : idx)}
            >
              <StepIcon status={step.status} />
              <div className="flex-1">
                <span className={clsx('text-sm font-medium', themeClasses.text.primary)}>
                  Step {step.step}: {step.name}
                </span>
                <span className={clsx('ml-3 text-xs', themeClasses.text.secondary)}>{step.summary}</span>
              </div>
              {expanded === idx ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {expanded === idx && (
              <div className={clsx('px-4 pb-4 text-xs space-y-2', themeClasses.bg.secondary)}>
                {step.warnings?.map((w, i) => (
                  <p key={i} className="text-yellow-600 dark:text-yellow-400">⚠ {w}</p>
                ))}
                {step.errors?.map((e, i) => (
                  <p key={i} className="text-red-600 dark:text-red-400">✗ {e}</p>
                ))}
                {step.rawSample && (
                  <pre className={clsx('mt-2 p-2 rounded text-xs overflow-x-auto max-h-40', themeClasses.bg.primary, themeClasses.text.secondary)}>
                    {step.rawSample}
                  </pre>
                )}
                {step.preview && step.preview.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="text-xs w-full">
                      <thead>
                        <tr className={themeClasses.text.secondary}>
                          {Object.keys(step.preview[0]).map((k) => (
                            <th key={k} className="text-left px-2 py-1 font-medium">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {step.preview.slice(0, 3).map((row, i) => (
                          <tr key={i} className={themeClasses.text.primary}>
                            {Object.values(row).map((v: any, j) => (
                              <td key={j} className="px-2 py-1 truncate max-w-xs">{String(v ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        {!isSaved && (
          <button onClick={onSave} className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary)}>
            Save Connector
          </button>
        )}
        {overall !== 'failed' && (
          <>
            <button onClick={onDryRun} className={clsx('px-4 py-2 rounded text-sm font-medium', 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800')}>
              Run Dry Run
            </button>
            {isSaved && (
              <button onClick={onSync} className={clsx('px-4 py-2 rounded text-sm font-medium', 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800')}>
                Sync Now
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Dry Run Modal ────────────────────────────────────────────────────────────

function DryRunModal({ result, onClose, onConfirmSync }: {
  result: DryRunResult;
  onClose: () => void;
  onConfirmSync: () => void;
}) {
  const exportCSV = () => {
    const rows = result.preview.map((r) =>
      [r.source_identifier, r.match_status, r.action, r.fields_mapped, r.warnings.join('; ')].join(',')
    );
    const csv = ['Source Identifier,Match Status,Action,Fields Mapped,Warnings', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'dry-run-preview.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col', themeClasses.bg.card)}>
        <div className={clsx('px-6 py-4 border-b flex justify-between items-center', themeClasses.border.primary)}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>Dry Run Results</h2>
          <button onClick={onClose} className={clsx('text-xl', themeClasses.text.secondary)}>✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total Fetched', value: result.total_fetched, color: '' },
              { label: 'To Create', value: result.to_create, color: 'text-green-600 dark:text-green-400' },
              { label: 'To Update', value: result.to_update, color: 'text-blue-600 dark:text-blue-400' },
              { label: 'To Skip', value: result.to_skip, color: 'text-gray-500' },
            ].map((c) => (
              <div key={c.label} className={clsx('rounded-lg p-3 text-center', themeClasses.bg.secondary)}>
                <p className={clsx('text-2xl font-bold', c.color || themeClasses.text.primary)}>{c.value}</p>
                <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>{c.label}</p>
              </div>
            ))}
          </div>

          {/* Preview table */}
          <div>
            <p className={clsx('text-sm font-medium mb-2', themeClasses.text.primary)}>Preview (first 20 rows)</p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-xs">
                <thead className={clsx('bg-gray-50 dark:bg-gray-800')}>
                  <tr>
                    {['Source Identifier', 'Status', 'Action', 'Fields', 'Warnings'].map((h) => (
                      <th key={h} className={clsx('px-3 py-2 text-left font-medium', themeClasses.text.secondary)}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.preview.map((row, i) => (
                    <tr key={i} className={clsx('border-t border-gray-100 dark:border-gray-800', themeClasses.text.primary)}>
                      <td className="px-3 py-2 font-mono">{row.source_identifier}</td>
                      <td className="px-3 py-2">
                        <span className={clsx('px-2 py-0.5 rounded-full text-xs',
                          row.match_status === 'Matched' ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200'
                            : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200')}>
                          {row.match_status}
                        </span>
                      </td>
                      <td className="px-3 py-2">{row.action}</td>
                      <td className="px-3 py-2">{row.fields_mapped}</td>
                      <td className="px-3 py-2 text-yellow-600 dark:text-yellow-400">{row.warnings.join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className={clsx('px-6 py-4 border-t flex gap-3 justify-between', themeClasses.border.primary)}>
          <button onClick={exportCSV} className={clsx('flex items-center gap-2 px-4 py-2 rounded text-sm', themeClasses.button.secondary)}>
            <Download size={14} /> Export CSV
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className={clsx('px-4 py-2 rounded text-sm', themeClasses.button.secondary)}>Cancel</button>
            <button
              onClick={() => {
                const msg = `This will create ${result.to_create}, update ${result.to_update}, skip ${result.to_skip} records. Proceed?`;
                if (window.confirm(msg)) { onConfirmSync(); onClose(); }
              }}
              className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary)}
            >
              Proceed with Live Sync
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Health Sparkline ─────────────────────────────────────────────────────────

function HealthSparkline({ syncs }: { syncs: Array<{ status: string; records_fetched: number }> }) {
  if (!syncs.length) return <span className="text-xs text-gray-400">No history</span>;
  return (
    <div className="flex items-end gap-0.5 h-6">
      {syncs.map((s, i) => (
        <div
          key={i}
          title={`${s.status} — ${s.records_fetched} records`}
          className={clsx(
            'w-2 rounded-sm',
            s.status === 'Success' ? 'bg-green-400' : s.status === 'Partial' ? 'bg-yellow-400' : 'bg-red-400'
          )}
          style={{ height: `${Math.max(4, Math.min(24, (s.records_fetched / 100) * 24))}px` }}
        />
      ))}
    </div>
  );
}

// ─── Connector Card ───────────────────────────────────────────────────────────

function ConnectorCard({ connector, onEdit, onDelete, onSync }: {
  connector: Connector;
  onEdit: (c: Connector) => void;
  onDelete: (id: string) => void;
  onSync: (id: string) => void;
}) {
  const { data: healthData } = useQuery<{ data: HealthData }>({
    queryKey: ['connector-health', connector.connector_id],
    queryFn: () => api.get(`/api/v1/connectors/${connector.connector_id}/health`).then((r) => r.data),
    refetchInterval: 60_000,
  });
  const health = healthData?.data;

  const healthDot = {
    green: 'bg-green-400',
    amber: 'bg-yellow-400',
    red: 'bg-red-400',
    gray: 'bg-gray-400',
  }[health?.health_status ?? 'gray'];

  return (
    <div className={clsx('rounded-xl border p-4 space-y-3', themeClasses.bg.card, themeClasses.border.primary)}>
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <span className={clsx('w-2.5 h-2.5 rounded-full', healthDot)} title={`Health: ${health?.health_status ?? 'unknown'}`} />
          <div>
            <h3 className={clsx('font-semibold text-sm', themeClasses.text.primary)}>{connector.name}</h3>
            <p className={clsx('text-xs uppercase tracking-wide', themeClasses.text.secondary)}>{connector.type}</p>
          </div>
        </div>
        <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium',
          connector.is_enabled ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300')}>
          {connector.is_enabled ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Auto-disable warning */}
      {(health?.consecutive_failures ?? 0) >= 3 && (
        <div className="flex items-center gap-1.5 text-xs text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 px-2 py-1 rounded">
          <AlertTriangle size={12} />
          {(health?.consecutive_failures ?? 0) >= 5
            ? 'Auto-disabled after 5 consecutive failures'
            : `Warning: ${health?.consecutive_failures} consecutive failures (auto-disables at 5)`}
        </div>
      )}

      {/* Sparkline */}
      <div className="flex items-center justify-between">
        <div>
          <p className={clsx('text-xs mb-1', themeClasses.text.secondary)}>Last 10 syncs</p>
          <HealthSparkline syncs={health?.recent_syncs ?? []} />
        </div>
        <div className="text-right">
          <p className={clsx('text-xs', themeClasses.text.secondary)}>Last sync</p>
          <p className={clsx('text-xs font-medium', themeClasses.text.primary)}>
            {connector.last_sync ? new Date(connector.last_sync).toLocaleDateString() : 'Never'}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => onSync(connector.connector_id)} className={clsx('flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-medium text-white', themeClasses.button.primary)}>
          <Play size={12} /> Sync Now
        </button>
        <button onClick={() => onEdit(connector)} className={clsx('px-3 py-2 rounded', themeClasses.button.secondary)}>
          <Edit2 size={13} />
        </button>
        <button onClick={() => { if (window.confirm('Delete this connector?')) onDelete(connector.connector_id); }}
          className="px-3 py-2 rounded bg-red-100 dark:bg-red-900/40">
          <Trash2 size={13} className="text-red-600 dark:text-red-400" />
        </button>
      </div>
    </div>
  );
}

// ─── Field Mapper ─────────────────────────────────────────────────────────────

function FieldMapper({ fieldMap, onChange, sampleKeys }: {
  fieldMap: Record<string, string>;
  onChange: (map: Record<string, string>) => void;
  sampleKeys: string[];
}) {
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState(REGISTRY_FIELDS[0]);

  const addMapping = () => {
    if (!newSource) return;
    onChange({ ...fieldMap, [newSource]: newTarget });
    setNewSource('');
  };

  const removeMapping = (key: string) => {
    const updated = { ...fieldMap };
    delete updated[key];
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={clsx('block text-xs font-medium mb-1', themeClasses.text.secondary)}>Source field (API key, dot-notation OK)</label>
          <input
            value={newSource}
            onChange={(e) => setNewSource(e.target.value)}
            placeholder="e.g. deviceDetail.operatingSystem"
            list="source-keys"
            className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
          />
          <datalist id="source-keys">
            {sampleKeys.map((k) => <option key={k} value={k} />)}
          </datalist>
        </div>
        <div className="flex-1">
          <label className={clsx('block text-xs font-medium mb-1', themeClasses.text.secondary)}>→ Registry field</label>
          <select
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
          >
            {REGISTRY_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button onClick={addMapping} className={clsx('px-3 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary)}>Add</button>
        </div>
      </div>

      {Object.keys(fieldMap).length > 0 && (
        <div className="space-y-1">
          {Object.entries(fieldMap).map(([src, tgt]) => (
            <div key={src} className={clsx('flex items-center gap-2 px-3 py-2 rounded text-sm', themeClasses.bg.secondary)}>
              <span className={clsx('font-mono text-xs flex-1', themeClasses.text.primary)}>{src}</span>
              <span className={clsx('text-xs', themeClasses.text.secondary)}>→</span>
              <span className={clsx('text-xs flex-1', themeClasses.text.primary)}>{tgt}</span>
              <button onClick={() => removeMapping(src)} className="text-red-400 hover:text-red-600"><XCircle size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Connector Form ───────────────────────────────────────────────────────────

function ConnectorForm({ editing, onClose, onSaved }: {
  editing?: Connector;
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  const [step, setStep] = useState<'config' | 'mapping' | 'test'>('config');
  const [form, setForm] = useState({ ...DEFAULT_FORM, ...(editing ? {
    name: editing.name, type: editing.type, base_url: editing.base_url,
    auth_type: editing.auth_type, endpoint: editing.endpoint,
    pagination_type: editing.pagination_type, response_root_key: editing.response_root_key,
    field_map: editing.field_map ?? {},
  } : {}) });
  const [testSteps, setTestSteps] = useState<TestStep[]>([]);
  const [testOverall, setTestOverall] = useState<'passed' | 'failed' | 'warning'>('failed');
  const [savedConnectorId, setSavedConnectorId] = useState<string | undefined>(editing?.connector_id);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [sampleKeys, setSampleKeys] = useState<string[]>([]);

  const handleTypeChange = (type: string) => {
    const preset = PRESET_CONFIGS[type] ?? {};
    setForm((f) => ({ ...f, type, ...preset }));
  };

  const testMutation = useMutation({
    mutationFn: async () => {
      if (savedConnectorId) {
        const r = await api.post(`/api/v1/connectors/${savedConnectorId}/test-full`);
        return r.data;
      }
      // Test without saving first using simple test endpoint
      const r = await api.post('/api/v1/connectors/test', form);
      return r.data;
    },
    onSuccess: (data) => {
      setTestSteps(data.steps || []);
      setTestOverall(data.overall || 'failed');
      // Extract sample keys from step 3/4 data
      const step3 = data.steps?.find((s: TestStep) => s.step === 3);
      if (step3?.preview?.length) {
        setSampleKeys(Object.keys(step3.preview[0]));
      }
      setStep('test');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Test failed');
      setTestSteps([{ step: 1, name: 'Connection', status: 'failed', summary: err.response?.data?.error || 'Connection failed' }]);
      setTestOverall('failed');
      setStep('test');
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => editing
      ? api.put(`/api/v1/connectors/${editing.connector_id}`, form)
      : api.post('/api/v1/connectors', form),
    onSuccess: (r) => {
      const id = r.data?.data?.connector_id;
      if (id) setSavedConnectorId(id);
      toast.success(editing ? 'Connector updated' : 'Connector created');
      onSaved(id);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Save failed'),
  });

  const dryRunMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/connectors/${savedConnectorId}/dry-run`),
    onSuccess: (r) => setDryRunResult(r.data.data),
    onError: (err: any) => toast.error(err.response?.data?.error || 'Dry run failed'),
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/connectors/${savedConnectorId}/sync`),
    onSuccess: () => toast.success('Sync started!'),
    onError: (err: any) => toast.error(err.response?.data?.error || 'Sync failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col', themeClasses.bg.card)}>
        {/* Header */}
        <div className={clsx('px-6 py-4 border-b flex justify-between items-center sticky top-0', themeClasses.border.primary, themeClasses.bg.card)}>
          <div className="flex items-center gap-4">
            <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>
              {editing ? 'Edit Connector' : 'New Connector'}
            </h2>
            <div className="flex gap-1">
              {(['config', 'mapping', 'test'] as const).map((s, i) => (
                <button key={s} onClick={() => setStep(s)} className={clsx(
                  'px-3 py-1 rounded text-xs font-medium',
                  step === s ? 'bg-blue-600 text-white' : clsx(themeClasses.button.secondary, themeClasses.text.secondary)
                )}>
                  {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className={clsx('text-xl', themeClasses.text.secondary)}>✕</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* ── Config Step ── */}
          {step === 'config' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Connector Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Production Intune"
                    className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
                </div>
                <div>
                  <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Connector Type</label>
                  <select value={form.type} onChange={(e) => handleTypeChange(e.target.value)}
                    className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                    {CONNECTOR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Base URL *</label>
                <input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                  placeholder="https://api.example.com"
                  className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Auth Type</label>
                  <select value={form.auth_type} onChange={(e) => setForm({ ...form, auth_type: e.target.value })}
                    className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                    {['None', 'API Key', 'Bearer Token', 'Basic Auth', 'OAuth2 Client Credentials'].map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Endpoint Path *</label>
                  <input value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
                    placeholder="/devices"
                    className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
                </div>
              </div>

              {/* Auth config fields */}
              {form.auth_type === 'OAuth2 Client Credentials' && (
                <div className="space-y-3">
                  {[['token_url', 'Token URL', 'https://login.microsoftonline.com/.../token'],
                    ['client_id', 'Client ID', ''],
                    ['client_secret', 'Client Secret', ''],
                    ['scope', 'Scope (optional)', 'https://graph.microsoft.com/.default']].map(([k, label, ph]) => (
                    <div key={k}>
                      <label className={clsx('block text-xs font-medium mb-1', themeClasses.text.secondary)}>{label}</label>
                      <input type={k === 'client_secret' ? 'password' : 'text'}
                        value={form.auth_config[k] ?? ''}
                        onChange={(e) => setForm({ ...form, auth_config: { ...form.auth_config, [k]: e.target.value } })}
                        placeholder={ph}
                        className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
                    </div>
                  ))}
                </div>
              )}

              {form.auth_type === 'API Key' && (
                <div>
                  <label className={clsx('block text-xs font-medium mb-1', themeClasses.text.secondary)}>API Key</label>
                  <input type="password" value={form.auth_config.api_key ?? ''}
                    onChange={(e) => setForm({ ...form, auth_config: { ...form.auth_config, api_key: e.target.value } })}
                    className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
                </div>
              )}

              {(form.auth_type === 'Bearer Token') && (
                <div>
                  <label className={clsx('block text-xs font-medium mb-1', themeClasses.text.secondary)}>Bearer Token</label>
                  <input type="password" value={form.auth_config.token ?? ''}
                    onChange={(e) => setForm({ ...form, auth_config: { ...form.auth_config, token: e.target.value } })}
                    className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
                </div>
              )}

              {form.auth_type === 'Basic Auth' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={clsx('block text-xs font-medium mb-1', themeClasses.text.secondary)}>Username</label>
                    <input value={form.auth_config.username ?? ''}
                      onChange={(e) => setForm({ ...form, auth_config: { ...form.auth_config, username: e.target.value } })}
                      className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
                  </div>
                  <div>
                    <label className={clsx('block text-xs font-medium mb-1', themeClasses.text.secondary)}>Password</label>
                    <input type="password" value={form.auth_config.password ?? ''}
                      onChange={(e) => setForm({ ...form, auth_config: { ...form.auth_config, password: e.target.value } })}
                      className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Pagination</label>
                  <select value={form.pagination_type} onChange={(e) => setForm({ ...form, pagination_type: e.target.value })}
                    className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                    {['None', 'Offset-Limit', 'Page Number', 'Cursor / nextLink'].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Response Root Key</label>
                  <input value={form.response_root_key} onChange={(e) => setForm({ ...form, response_root_key: e.target.value })}
                    placeholder="e.g. value, results"
                    className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
                </div>
                <div>
                  <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Sync Schedule</label>
                  <select value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                    className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                    {['Manual', 'Every 15 min', 'Hourly', 'Every 6 hours', 'Daily'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* ── Mapping Step ── */}
          {step === 'mapping' && (
            <div className="space-y-3">
              <p className={clsx('text-sm', themeClasses.text.secondary)}>
                Map source API fields to registry fields. Use dot-notation for nested keys (e.g. <code className="font-mono text-xs">deviceDetail.os</code>).
              </p>
              <FieldMapper fieldMap={form.field_map} onChange={(map) => setForm({ ...form, field_map: map })} sampleKeys={sampleKeys} />
              <div className={clsx('text-xs px-3 py-2 rounded', themeClasses.bg.secondary, themeClasses.text.secondary)}>
                Coverage: {Object.keys(form.field_map).length} of {REGISTRY_FIELDS.length} registry fields mapped.
                {!form.field_map.asset_name && ' ⚠ asset_name is required.'}
              </div>
            </div>
          )}

          {/* ── Test Step ── */}
          {step === 'test' && testSteps.length > 0 && (
            <TestResultsStepper
              steps={testSteps}
              overall={testOverall}
              isSaved={!!savedConnectorId}
              onDryRun={() => dryRunMutation.mutate()}
              onSave={() => saveMutation.mutate()}
              onSync={() => syncMutation.mutate()}
            />
          )}

          {step === 'test' && testSteps.length === 0 && (
            <div className={clsx('text-center py-8', themeClasses.text.secondary)}>
              <Activity size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Click "Run Test" to validate this connector</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={clsx('px-6 py-4 border-t flex gap-3 justify-between sticky bottom-0', themeClasses.border.primary, themeClasses.bg.card)}>
          <div className="flex gap-2">
            {step !== 'config' && (
              <button onClick={() => setStep(step === 'test' ? 'mapping' : 'config')}
                className={clsx('px-4 py-2 rounded text-sm', themeClasses.button.secondary)}>
                ← Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className={clsx('px-4 py-2 rounded text-sm', themeClasses.button.secondary)}>Cancel</button>
            {step === 'config' && (
              <>
                <button onClick={() => setStep('mapping')} className={clsx('px-4 py-2 rounded text-sm', themeClasses.button.secondary)}>
                  Field Mapping →
                </button>
                <button
                  onClick={() => testMutation.mutate()}
                  disabled={!form.name || !form.base_url || !form.endpoint || testMutation.isPending}
                  className={clsx('px-4 py-2 rounded text-sm font-medium', 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 disabled:opacity-50')}>
                  {testMutation.isPending ? <RefreshCw size={14} className="animate-spin inline mr-1" /> : null}
                  {testMutation.isPending ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={!form.name || !form.base_url || !form.endpoint || saveMutation.isPending}
                  className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}>
                  {editing ? 'Save Changes' : 'Create Connector'}
                </button>
              </>
            )}
            {step === 'mapping' && (
              <button onClick={() => { testMutation.mutate(); }}
                disabled={testMutation.isPending}
                className={clsx('px-4 py-2 rounded text-sm font-medium', 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200')}>
                Test & Validate →
              </button>
            )}
          </div>
        </div>
      </div>

      {dryRunResult && (
        <DryRunModal
          result={dryRunResult}
          onClose={() => setDryRunResult(null)}
          onConfirmSync={() => { syncMutation.mutate(); setDryRunResult(null); }}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AssetConnectorsPage() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [editingConnector, setEditingConnector] = useState<Connector | undefined>();
  const queryClient = useQueryClient();

  const { data: connectorsData, isLoading } = useQuery({
    queryKey: ['asset-connectors'],
    queryFn: async () => {
      const r = await api.get('/api/v1/connectors');
      return r.data.data || [];
    },
  });
  const connectors: Connector[] = connectorsData || [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/connectors/${id}`),
    onSuccess: () => { toast.success('Connector deleted'); queryClient.invalidateQueries({ queryKey: ['asset-connectors'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/connectors/${id}/sync`),
    onSuccess: () => { toast.success('Sync started!'); queryClient.invalidateQueries({ queryKey: ['asset-connectors'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Sync failed'),
  });

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-6xl mx-auto space-y-6">
        <button onClick={() => navigate('/assets')} className={clsx('flex items-center gap-2', themeClasses.text.primary, 'hover:opacity-70')}>
          <ArrowLeft size={20} /> Back to Assets
        </button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className={clsx('text-3xl font-bold mb-1', themeClasses.text.primary)}>API Connectors</h1>
            <p className={clsx('text-sm', themeClasses.text.secondary)}>Configure integrations to pull asset data automatically</p>
          </div>
          <button onClick={() => { setEditingConnector(undefined); setShowForm(true); }}
            className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}>
            <Plus size={18} /> Add Connector
          </button>
        </div>

        {isLoading ? (
          <div className={clsx('text-center py-12', themeClasses.text.secondary)}>Loading connectors...</div>
        ) : connectors.length === 0 ? (
          <div className={clsx('rounded-xl p-12 text-center border', themeClasses.bg.card, themeClasses.border.primary)}>
            <Activity size={40} className={clsx('mx-auto mb-4 opacity-30', themeClasses.text.secondary)} />
            <p className={clsx('text-lg font-medium mb-2', themeClasses.text.primary)}>No connectors yet</p>
            <p className={clsx('text-sm mb-6', themeClasses.text.secondary)}>Create your first API connector to start importing assets automatically</p>
            <button onClick={() => setShowForm(true)} className={clsx('inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}>
              <Plus size={18} /> Create Connector
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connectors.map((c) => (
              <ConnectorCard key={c.connector_id || c.id} connector={c}
                onEdit={(conn) => { setEditingConnector(conn); setShowForm(true); }}
                onDelete={(id) => deleteMutation.mutate(id)}
                onSync={(id) => syncMutation.mutate(id)} />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <ConnectorForm
          editing={editingConnector}
          onClose={() => { setShowForm(false); setEditingConnector(undefined); }}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['asset-connectors'] })}
        />
      )}
    </div>
  );
}
