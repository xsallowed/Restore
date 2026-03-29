import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Edit2, Trash2, Play, Clock, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface Connector {
  id: string;
  name: string;
  type: string;
  base_url: string;
  auth_type: string;
  endpoint: string;
  pagination_type: string;
  response_root_key?: string;
  schedule: string;
  is_enabled: boolean;
  last_sync?: string;
  sync_status?: 'Success' | 'Partial' | 'Failed' | 'Running';
  next_sync?: string;
  created_at: string;
  updated_at: string;
}

const CONNECTOR_TYPES = [
  { label: 'Microsoft Intune', value: 'intune', preset: true },
  { label: 'ServiceNow CMDB', value: 'servicenow', preset: true },
  { label: 'CrowdStrike Falcon', value: 'crowdstrike', preset: true },
  { label: 'Qualys VMDR', value: 'qualys', preset: true },
  { label: 'Tenable.io', value: 'tenable', preset: true },
  { label: 'Jamf Pro', value: 'jamf', preset: true },
  { label: 'Generic REST API', value: 'generic', preset: false },
];

const AUTH_TYPES = [
  { label: 'No Auth', value: 'none' },
  { label: 'API Key', value: 'api_key' },
  { label: 'Bearer Token', value: 'bearer' },
  { label: 'Basic Auth', value: 'basic' },
  { label: 'OAuth2 Client Credentials', value: 'oauth2' },
];

const PAGINATION_TYPES = [
  { label: 'None', value: 'none' },
  { label: 'Offset/Limit', value: 'offset' },
  { label: 'Page Number', value: 'page' },
  { label: 'Cursor / nextLink', value: 'cursor' },
];

const SYNC_SCHEDULES = [
  { label: 'Manual only', value: 'manual' },
  { label: 'Every 15 minutes', value: '15m' },
  { label: 'Every hour', value: '1h' },
  { label: 'Every 6 hours', value: '6h' },
  { label: 'Daily', value: 'daily' },
];

const ASSET_FIELDS = [
  'asset_name',
  'asset_type',
  'ip_address',
  'mac_address',
  'os_name',
  'os_version',
  'serial_number',
  'manufacturer',
  'model',
  'owner_email',
  'owner_name',
  'location',
  'status',
  'last_seen',
  'hostname',
  'tags',
  'notes',
];

const PRESET_CONFIGS: Record<string, any> = {
  intune: {
    base_url: 'https://graph.microsoft.com/v1.0',
    auth_type: 'oauth2',
    token_url: 'https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token',
    scope: 'https://graph.microsoft.com/.default',
    endpoint: '/deviceManagement/managedDevices',
    pagination_type: 'cursor',
    response_root_key: 'value',
  },
  servicenow: {
    base_url: 'https://{instance}.service-now.com',
    auth_type: 'basic',
    endpoint: '/api/now/table/cmdb_ci_computer',
    pagination_type: 'offset',
    response_root_key: 'result',
  },
  crowdstrike: {
    base_url: 'https://api.crowdstrike.com',
    auth_type: 'oauth2',
    token_url: 'https://api.crowdstrike.com/oauth2/token',
    endpoint: '/devices/queries/devices/v1',
    pagination_type: 'cursor',
  },
  tenable: {
    base_url: 'https://cloud.tenable.com',
    auth_type: 'api_key',
    endpoint: '/assets',
    pagination_type: 'cursor',
    response_root_key: 'assets',
  },
  jamf: {
    base_url: 'https://{instance}.jamfcloud.com',
    auth_type: 'bearer',
    endpoint: '/api/v1/computers-preview',
    pagination_type: 'page',
    response_root_key: 'results',
  },
};

function ConnectorForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState<'config' | 'mapping' | 'test'>('config');
  const [form, setForm] = useState({
    name: '',
    type: 'generic',
    base_url: '',
    auth_type: 'none',
    endpoint: '',
    pagination_type: 'none',
    response_root_key: '',
    schedule: 'manual',
    is_enabled: true,
    auth_config: {} as Record<string, any>,
  });

  const [queryParams, setQueryParams] = useState<Array<{ key: string; value: string }>>([]);
  const [customHeaders, setCustomHeaders] = useState<Array<{ key: string; value: string }>>([]);

  const handleConnectorTypeChange = (type: string) => {
    setForm({ ...form, type });
    const preset = PRESET_CONFIGS[type];
    if (preset) {
      setForm((f) => ({ ...f, ...preset }));
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => api.post('/api/v1/connectors', form),
    onSuccess: () => {
      toast.success('Connector created successfully');
      onSaved();
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create connector'),
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-lg shadow-xl w-full max-w-2xl max-h-96 overflow-y-auto', themeClasses.bg.card)}>
        {/* Header with Back Button */}
        <div className={clsx('px-6 py-4 border-b', themeClasses.border.primary, 'flex justify-between items-center sticky top-0', themeClasses.bg.card)}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>Configure API Connector</h2>
          <button onClick={onClose} className={clsx('text-2xl', themeClasses.text.secondary)}>
            ✕
          </button>
        </div>

        <div className={clsx('px-6 py-6 space-y-4')}>
          {/* Connector Name */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Connector Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Production Intune"
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
          </div>

          {/* Connector Type */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Connector Type *</label>
            <select
              value={form.type}
              onChange={(e) => handleConnectorTypeChange(e.target.value)}
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            >
              {CONNECTOR_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Base URL */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Base URL *</label>
            <input
              type="text"
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
              placeholder="https://api.example.com/v1"
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
          </div>

          {/* Auth Type */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Authentication Type</label>
            <select
              value={form.auth_type}
              onChange={(e) => setForm({ ...form, auth_type: e.target.value })}
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            >
              {AUTH_TYPES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {/* Auth Config Fields (shown based on auth type) */}
          {form.auth_type === 'api_key' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Header Name</label>
                  <input
                    type="text"
                    value={form.auth_config.header_name || ''}
                    onChange={(e) => setForm({ ...form, auth_config: { ...form.auth_config, header_name: e.target.value } })}
                    placeholder="X-API-Key"
                    className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                  />
                </div>
                <div>
                  <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>API Key</label>
                  <input
                    type="password"
                    value={form.auth_config.api_key || ''}
                    onChange={(e) => setForm({ ...form, auth_config: { ...form.auth_config, api_key: e.target.value } })}
                    placeholder="••••••••"
                    className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                  />
                </div>
              </div>
            </>
          )}

          {form.auth_type === 'bearer' && (
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Bearer Token</label>
              <input
                type="password"
                value={form.auth_config.token || ''}
                onChange={(e) => setForm({ ...form, auth_config: { ...form.auth_config, token: e.target.value } })}
                placeholder="••••••••"
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
          )}

          {form.auth_type === 'basic' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Username</label>
                <input
                  type="text"
                  value={form.auth_config.username || ''}
                  onChange={(e) => setForm({ ...form, auth_config: { ...form.auth_config, username: e.target.value } })}
                  className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                />
              </div>
              <div>
                <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Password</label>
                <input
                  type="password"
                  value={form.auth_config.password || ''}
                  onChange={(e) => setForm({ ...form, auth_config: { ...form.auth_config, password: e.target.value } })}
                  className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                />
              </div>
            </div>
          )}

          {form.auth_type === 'oauth2' && (
            <>
              <div>
                <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Token URL</label>
                <input
                  type="text"
                  value={form.auth_config.token_url || ''}
                  onChange={(e) => setForm({ ...form, auth_config: { ...form.auth_config, token_url: e.target.value } })}
                  className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Client ID</label>
                  <input
                    type="text"
                    value={form.auth_config.client_id || ''}
                    onChange={(e) => setForm({ ...form, auth_config: { ...form.auth_config, client_id: e.target.value } })}
                    className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                  />
                </div>
                <div>
                  <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Client Secret</label>
                  <input
                    type="password"
                    value={form.auth_config.client_secret || ''}
                    onChange={(e) => setForm({ ...form, auth_config: { ...form.auth_config, client_secret: e.target.value } })}
                    className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                  />
                </div>
              </div>
            </>
          )}

          {/* Endpoint */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Endpoint Path *</label>
            <input
              type="text"
              value={form.endpoint}
              onChange={(e) => setForm({ ...form, endpoint: e.target.value })}
              placeholder="/devices"
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
          </div>

          {/* Pagination Type */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Pagination Type</label>
            <select
              value={form.pagination_type}
              onChange={(e) => setForm({ ...form, pagination_type: e.target.value })}
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            >
              {PAGINATION_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Response Root Key */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Response Root Key (optional)</label>
            <input
              type="text"
              value={form.response_root_key}
              onChange={(e) => setForm({ ...form, response_root_key: e.target.value })}
              placeholder="value (for Intune), result (for ServiceNow)"
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
          </div>

          {/* Sync Schedule */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Sync Schedule</label>
            <select
              value={form.schedule}
              onChange={(e) => setForm({ ...form, schedule: e.target.value })}
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            >
              {SYNC_SCHEDULES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center gap-3">
            <label className={clsx('text-sm font-medium', themeClasses.text.primary)}>Active</label>
            <input
              type="checkbox"
              checked={form.is_enabled}
              onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
              className="w-5 h-5 rounded cursor-pointer"
            />
          </div>
        </div>

        {/* Footer */}
        <div className={clsx('px-6 py-4 border-t', themeClasses.border.primary, 'flex gap-3 justify-end sticky bottom-0', themeClasses.bg.card)}>
          <button onClick={onClose} className={clsx('px-4 py-2 rounded text-sm font-medium', themeClasses.button.secondary)}>
            Cancel
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!form.name || !form.base_url || !form.endpoint || saveMutation.isPending}
            className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}
          >
            {saveMutation.isPending ? 'Creating...' : 'Create Connector'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectorCard({ connector, onEdit, onDelete, onSync }: { connector: Connector; onEdit: (c: Connector) => void; onDelete: (id: string) => void; onSync: (id: string) => void }) {
  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'Success':
        return <CheckCircle size={16} className="text-green-600 dark:text-green-400" />;
      case 'Partial':
        return <AlertCircle size={16} className="text-yellow-600 dark:text-yellow-400" />;
      case 'Failed':
        return <XCircle size={16} className="text-red-600 dark:text-red-400" />;
      default:
        return <Clock size={16} className={clsx(themeClasses.text.secondary)} />;
    }
  };

  return (
    <div className={clsx('rounded-lg p-4 border', themeClasses.bg.secondary, themeClasses.border.primary)}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className={clsx('font-semibold', themeClasses.text.primary)}>{connector.name}</h3>
          <p className={clsx('text-xs', themeClasses.text.secondary)}>{connector.type.toUpperCase()}</p>
        </div>
        <span className={clsx('px-3 py-1 rounded-full text-xs font-medium', connector.is_enabled ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200')}>
          {connector.is_enabled ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2 text-sm">
          {getStatusIcon(connector.sync_status)}
          <span className={clsx(themeClasses.text.secondary)}>Last sync: {connector.last_sync ? new Date(connector.last_sync).toLocaleDateString() : 'Never'}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Clock size={16} className={clsx(themeClasses.text.secondary)} />
          <span className={clsx(themeClasses.text.secondary)}>Next sync: {connector.next_sync ? new Date(connector.next_sync).toLocaleDateString() : 'Manual only'}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => onSync(connector.id)} className={clsx('flex-1 px-3 py-2 rounded text-xs font-medium flex items-center justify-center gap-2', themeClasses.button.primary)}>
          <Play size={14} />
          Sync Now
        </button>
        <button onClick={() => onEdit(connector)} className={clsx('px-3 py-2 rounded', themeClasses.button.secondary)}>
          <Edit2 size={14} />
        </button>
        <button onClick={() => onDelete(connector.id)} className={clsx('px-3 py-2 rounded', 'bg-red-100 dark:bg-red-900')}>
          <Trash2 size={14} className="text-red-600 dark:text-red-400" />
        </button>
      </div>
    </div>
  );
}

export function AssetConnectorsPage() {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: connectorsData, isLoading } = useQuery({
    queryKey: ['asset-connectors'],
    queryFn: async () => {
      try {
        const response = await api.get('/api/v1/connectors');
        return response.data.data || [];
      } catch (err) {
        return [];
      }
    },
  });

  const connectors: Connector[] = connectorsData || [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/connectors/${id}`),
    onSuccess: () => {
      toast.success('Connector deleted');
      queryClient.invalidateQueries({ queryKey: ['asset-connectors'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete connector'),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/connectors/${id}/sync`),
    onSuccess: () => {
      toast.success('Sync started! Check back soon for results.');
      queryClient.invalidateQueries({ queryKey: ['asset-connectors'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to start sync'),
  });

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header with Back Button */}
        <div className={clsx('flex justify-between items-start')}>
          <div>
            <button onClick={() => navigate('/assets')} className={clsx('flex items-center gap-2 mb-4', themeClasses.text.primary, 'hover:opacity-70')}>
              <ArrowLeft size={20} />
              Back to Assets
            </button>
            <h1 className={clsx('text-3xl font-bold mb-1', themeClasses.text.primary)}>API Connectors</h1>
            <p className={clsx('text-sm', themeClasses.text.secondary)}>Configure integrations to pull asset data from external systems</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}
          >
            <Plus size={20} />
            Add Connector
          </button>
        </div>

        {/* Connectors List */}
        {isLoading ? (
          <div className={clsx('text-center p-12', themeClasses.text.secondary)}>Loading connectors...</div>
        ) : connectors.length === 0 ? (
          <div className={clsx('rounded-lg p-12 text-center', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
            <p className={clsx('text-lg font-medium mb-4', themeClasses.text.primary)}>No connectors yet</p>
            <p className={clsx('text-sm mb-6', themeClasses.text.secondary)}>Create your first API connector to start importing assets from external systems</p>
            <button onClick={() => setShowForm(true)} className={clsx('inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}>
              <Plus size={20} />
              Create Connector
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connectors.map((connector) => (
              <ConnectorCard key={connector.id} connector={connector} onEdit={() => {}} onDelete={(id) => deleteMutation.mutate(id)} onSync={(id) => syncMutation.mutate(id)} />
            ))}
          </div>
        )}
      </div>

      {showForm && <ConnectorForm onClose={() => setShowForm(false)} onSaved={() => queryClient.invalidateQueries({ queryKey: ['asset-connectors'] })} />}
    </div>
  );
}
