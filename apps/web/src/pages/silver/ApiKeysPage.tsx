import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Edit2, Trash2, AlertCircle, CheckCircle, Shield, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface ApiKey {
  asset_id: string;
  key_name: string;
  secret_type: string;
  platform: string;
  owner_team?: string;
  owner_email?: string;
  environment: string;
  where_stored?: string;
  exposed_in_code: boolean;
  risk_level: string;
  status: string;
  expiry_date?: string;
  rotation_interval?: number;
  auto_rotate: boolean;
  confidence_score: number;
  created_at: string;
  updated_at: string;
}

interface PaginatedResponse {
  success: boolean;
  data: ApiKey[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

const PLATFORMS = [
  'AWS', 'Azure', 'GCP', 'GitHub', 'Stripe', 'Twilio', 'SendGrid', 'Custom / Internal', 'Other'
];

const SECRET_TYPES = [
  'API Key', 'OAuth Client Secret', 'Service Account Key', 'PAT', 'Webhook Secret',
  'Signing Key', 'SSH Private Key', 'Certificate', 'Other'
];

const ENVIRONMENTS = ['Production', 'Staging', 'Dev', 'Test'];

const STORAGE_LOCATIONS = [
  'Vault', 'AWS Secrets Manager', 'Azure Key Vault', '.env file', 'Code Repository', 'Hardcoded', 'Unknown'
];

function RiskBadge({ level, tooltip }: { level: string; tooltip?: string }) {
  const colors: Record<string, string> = {
    'Critical': 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
    'High': 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200',
    'Medium': 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
    'Low': 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
  };

  return (
    <div className="relative group">
      <span className={clsx('px-3 py-1 rounded-full text-xs font-semibold', colors[level] || colors['Low'])}>
        {level}
      </span>
      {tooltip && (
        <div className={clsx(
          'absolute bottom-full left-0 mb-2 hidden group-hover:block p-2 rounded text-xs whitespace-nowrap',
          'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 z-50'
        )}>
          {tooltip}
        </div>
      )}
    </div>
  );
}

function ApiKeyRow({
  apiKey,
  onEdit,
  onDelete,
}: {
  apiKey: ApiKey;
  onEdit: (key: ApiKey) => void;
  onDelete: (id: string) => void;
}) {
  const expiryDate = apiKey.expiry_date ? new Date(apiKey.expiry_date) : null;
  const isExpired = expiryDate && expiryDate < new Date();
  const daysUntilExpiry = expiryDate
    ? Math.ceil((expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <tr className={clsx('border-b', themeClasses.border.primary, 'hover:bg-opacity-50', themeClasses.bg.secondary)}>
      <td className={clsx('px-4 py-3 text-sm font-medium', themeClasses.text.primary)}>
        {apiKey.key_name}
      </td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{apiKey.platform}</td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{apiKey.secret_type}</td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{apiKey.environment}</td>

      <td className={clsx('px-4 py-3 text-sm')}>
        {expiryDate ? (
          <div className="flex items-center gap-1">
            <Calendar size={14} className={isExpired ? 'text-red-600' : 'text-gray-500'} />
            <span className={isExpired ? 'text-red-600 dark:text-red-400 font-semibold' : themeClasses.text.secondary}>
              {isExpired ? 'Expired' : `${daysUntilExpiry} days`}
            </span>
          </div>
        ) : (
          <span className={clsx('text-xs', themeClasses.text.secondary)}>Never</span>
        )}
      </td>

      <td className={clsx('px-4 py-3 text-sm')}>
        {apiKey.where_stored && (
          <span className={clsx('px-2 py-1 rounded text-xs',
            apiKey.where_stored === 'Hardcoded' || apiKey.where_stored === 'Code Repository'
              ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
          )}>
            {apiKey.where_stored}
          </span>
        )}
      </td>

      <td className={clsx('px-4 py-3 text-sm')}>
        <RiskBadge level={apiKey.risk_level} tooltip={apiKey.risk_level} />
      </td>

      <td className={clsx('px-4 py-3 text-sm')}>
        <span className={clsx(
          'px-3 py-1 rounded-full text-xs font-medium',
          apiKey.status === 'Active'
            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
        )}>
          {apiKey.status}
        </span>
      </td>

      <td className={clsx('px-4 py-3 text-sm', 'flex gap-2')}>
        <button
          onClick={() => onEdit(apiKey)}
          className={clsx('p-2 rounded hover:bg-opacity-50', themeClasses.bg.tertiary)}
          title="Edit"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Delete API key "${apiKey.key_name}"?`)) {
              onDelete(apiKey.asset_id);
            }
          }}
          className="p-2 rounded hover:bg-red-100 dark:hover:bg-red-900"
          title="Delete"
        >
          <Trash2 size={14} className="text-red-600 dark:text-red-400" />
        </button>
      </td>
    </tr>
  );
}

function CreateEditModal({ apiKey, onClose, onSave }: { apiKey?: ApiKey; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    key_name: apiKey?.key_name || '',
    secret_type: apiKey?.secret_type || 'API Key',
    platform: apiKey?.platform || 'AWS',
    owner_team: apiKey?.owner_team || '',
    owner_email: apiKey?.owner_email || '',
    environment: apiKey?.environment || 'Production',
    where_stored: apiKey?.where_stored || 'Vault',
    permission_scope: apiKey?.permission_scope || '',
    rotation_interval: apiKey?.rotation_interval || 90,
    auto_rotate: apiKey?.auto_rotate || false,
    expiry_date: apiKey?.expiry_date?.split('T')[0] || '',
    associated_service: apiKey?.associated_service || '',
    notes: apiKey?.notes || '',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (apiKey) {
        await api.put(`/api/v1/api-keys/${apiKey.asset_id}`, form);
      } else {
        await api.post('/api/v1/api-keys', form);
      }
    },
    onSuccess: () => {
      toast.success(apiKey ? 'API Key updated' : 'API Key created');
      onSave();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to save API Key');
    },
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-lg shadow-xl w-full max-w-2xl max-h-96 overflow-y-auto', themeClasses.bg.card)}>
        {/* Header */}
        <div className={clsx('px-6 py-4 border-b', themeClasses.border.primary, 'flex justify-between items-center sticky top-0', themeClasses.bg.card)}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>
            {apiKey ? 'Edit API Key' : 'Create API Key'}
          </h2>
          <button onClick={onClose} className={clsx('text-2xl', themeClasses.text.secondary)}>
            ✕
          </button>
        </div>

        <div className={clsx('px-6 py-6 space-y-4')}>
          {/* Key Name */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>
              Key Name *
            </label>
            <input
              type="text"
              value={form.key_name}
              onChange={(e) => setForm({ ...form, key_name: e.target.value })}
              placeholder="e.g., Stripe Production API Key"
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
          </div>

          {/* Platform & Secret Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Platform *</label>
              <select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Secret Type *</label>
              <select
                value={form.secret_type}
                onChange={(e) => setForm({ ...form, secret_type: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                {SECRET_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Owner Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Owner Team</label>
              <input
                type="text"
                value={form.owner_team}
                onChange={(e) => setForm({ ...form, owner_team: e.target.value })}
                placeholder="e.g., Platform Engineering"
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Owner Email</label>
              <input
                type="email"
                value={form.owner_email}
                onChange={(e) => setForm({ ...form, owner_email: e.target.value })}
                placeholder="owner@company.com"
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
          </div>

          {/* Environment & Storage */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Environment *</label>
              <select
                value={form.environment}
                onChange={(e) => setForm({ ...form, environment: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                {ENVIRONMENTS.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Stored In</label>
              <select
                value={form.where_stored}
                onChange={(e) => setForm({ ...form, where_stored: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                {STORAGE_LOCATIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Rotation Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Rotation Interval (days)</label>
              <input
                type="number"
                value={form.rotation_interval}
                onChange={(e) => setForm({ ...form, rotation_interval: parseInt(e.target.value) })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Expiry Date</label>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
          </div>

          {/* Auto Rotate */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.auto_rotate}
              onChange={(e) => setForm({ ...form, auto_rotate: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className={clsx('text-sm', themeClasses.text.primary)}>Enable automatic rotation</span>
          </label>

          {/* Permission Scope */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Permission Scope</label>
            <textarea
              value={form.permission_scope}
              onChange={(e) => setForm({ ...form, permission_scope: e.target.value })}
              placeholder="e.g., read:users write:orders"
              rows={3}
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Add any additional notes..."
              rows={2}
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className={clsx('px-6 py-4 border-t', themeClasses.border.primary, 'flex gap-3 justify-end sticky bottom-0', themeClasses.bg.card)}>
          <button onClick={onClose} className={clsx('px-4 py-2 rounded text-sm font-medium', themeClasses.button.secondary)}>
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.key_name || mutation.isPending}
            className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}
          >
            {mutation.isPending ? 'Saving...' : 'Save API Key'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ApiKeysPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | undefined>();
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: response, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['api-keys', page, search, platformFilter, riskFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        ...(search && { search }),
        ...(platformFilter && { platform: platformFilter }),
        ...(riskFilter && { risk_level: riskFilter }),
      });
      const res = await api.get(`/api/v1/api-keys?${params}`);
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/api-keys/${id}`),
    onSuccess: () => {
      toast.success('API Key deleted');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete'),
  });

  const apiKeys = response?.data || [];
  const totalPages = response?.total_pages || 1;

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Back Button */}
        <button onClick={() => navigate('/assets')} className={clsx('flex items-center gap-2', themeClasses.text.primary, 'hover:opacity-70 transition')}>
          <ArrowLeft size={20} />
          Back to Assets
        </button>

        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className={clsx('text-3xl font-bold mb-1', themeClasses.text.primary)}>API Keys & Secrets</h1>
            <p className={clsx('text-sm', themeClasses.text.secondary)}>Manage cryptographic credentials and tokens</p>
          </div>
          <button
            onClick={() => {
              setEditingKey(undefined);
              setShowModal(true);
            }}
            className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}
          >
            <Plus size={20} />
            Add API Key
          </button>
        </div>

        {/* Filters */}
        <div className={clsx('rounded-lg p-4', themeClasses.bg.card, 'border', themeClasses.border.primary, 'space-y-3')}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name..."
              className={clsx('px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
            <select
              value={platformFilter}
              onChange={(e) => {
                setPlatformFilter(e.target.value);
                setPage(1);
              }}
              className={clsx('px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            >
              <option value="">All Platforms</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={riskFilter}
              onChange={(e) => {
                setRiskFilter(e.target.value);
                setPage(1);
              }}
              className={clsx('px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            >
              <option value="">All Risk Levels</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className={clsx('text-center p-12', themeClasses.text.secondary)}>Loading API Keys...</div>
        ) : apiKeys.length === 0 ? (
          <div className={clsx('rounded-lg p-12 text-center', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
            <Shield size={48} className={clsx('mx-auto mb-4', themeClasses.text.secondary)} />
            <p className={clsx('text-lg font-medium mb-2', themeClasses.text.primary)}>No API Keys yet</p>
            <p className={clsx('text-sm mb-6', themeClasses.text.secondary)}>Create your first API key to track credentials and monitor their lifecycle.</p>
            <button
              onClick={() => {
                setEditingKey(undefined);
                setShowModal(true);
              }}
              className={clsx('inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}
            >
              <Plus size={20} />
              Create API Key
            </button>
          </div>
        ) : (
          <div className={clsx('rounded-lg border overflow-x-auto', themeClasses.bg.card, themeClasses.border.primary)}>
            <table className="w-full">
              <thead className={clsx('border-b', themeClasses.border.primary, themeClasses.bg.secondary)}>
                <tr>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Name</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Platform</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Type</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Environment</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Expiry</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Storage</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Risk</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Status</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((apiKey) => (
                  <ApiKeyRow
                    key={apiKey.asset_id}
                    apiKey={apiKey}
                    onEdit={(k) => {
                      setEditingKey(k);
                      setShowModal(true);
                    }}
                    onDelete={(id) => deleteMutation.mutate(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center">
            <p className={clsx('text-sm', themeClasses.text.secondary)}>
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className={clsx('px-3 py-2 rounded text-sm font-medium', themeClasses.button.secondary, 'disabled:opacity-50')}
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className={clsx('px-3 py-2 rounded text-sm font-medium', themeClasses.button.secondary, 'disabled:opacity-50')}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && <CreateEditModal key={editingKey?.asset_id} apiKey={editingKey} onClose={() => setShowModal(false)} onSave={() => queryClient.invalidateQueries({ queryKey: ['api-keys'] })} />}
    </div>
  );
}
