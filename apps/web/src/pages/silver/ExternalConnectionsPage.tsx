import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Edit2, Trash2, AlertCircle, Shield, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface ExternalConnection {
  asset_id: string;
  connection_name: string;
  connection_type: string;
  source_system?: string;
  destination_system?: string;
  protocol?: string;
  encryption?: string;
  owner_team?: string;
  owner_email?: string;
  is_active: boolean;
  access_controls?: string;
  last_monitored?: string;
  risk_level: string;
  status: string;
  exposed: boolean;
  suspicious_activity: boolean;
  created_at: string;
  updated_at: string;
}

interface PaginatedResponse {
  success: boolean;
  data: ExternalConnection[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

const CONNECTION_TYPES = [
  'Internet', 'Corporate VPN', 'Federated VPN', 'Cloud-to-Cloud',
  'Partner API', 'EDI Connection', 'Third-party SaaS', 'Supplier Connection', 'Other'
];

const PROTOCOLS = ['HTTPS', 'HTTP', 'SSH', 'SFTP', 'VPN', 'Direct Connect', 'Peering', 'Other'];

const ENCRYPTION_TYPES = ['TLS 1.3', 'TLS 1.2', 'AES-256', 'AES-128', 'Encrypted (Unknown)', 'Unencrypted', 'Unknown'];

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

function ConnectionRow({
  connection,
  onEdit,
  onDelete,
}: {
  connection: ExternalConnection;
  onEdit: (conn: ExternalConnection) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr className={clsx('border-b', themeClasses.border.primary, 'hover:bg-opacity-50', themeClasses.bg.secondary)}>
      <td className={clsx('px-4 py-3 text-sm font-medium', themeClasses.text.primary)}>
        {connection.connection_name}
      </td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{connection.connection_type}</td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{connection.protocol}</td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>
        {connection.encryption && (
          <span className={clsx('px-2 py-1 rounded text-xs',
            connection.encryption === 'Unencrypted'
              ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
              : 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
          )}>
            {connection.encryption}
          </span>
        )}
      </td>

      <td className={clsx('px-4 py-3 text-sm')}>
        <span className={clsx(
          'px-3 py-1 rounded-full text-xs font-medium',
          connection.is_active
            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
        )}>
          {connection.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>

      <td className={clsx('px-4 py-3 text-sm')}>
        {connection.exposed || connection.suspicious_activity ? (
          <div className="flex items-center gap-1">
            <AlertCircle size={14} className="text-red-600" />
            <span className="text-red-600 dark:text-red-400 text-xs font-semibold">
              {connection.exposed && connection.suspicious_activity ? 'Both Flags' : connection.exposed ? 'Exposed' : 'Suspicious'}
            </span>
          </div>
        ) : (
          <span className={clsx('text-xs', themeClasses.text.secondary)}>Clean</span>
        )}
      </td>

      <td className={clsx('px-4 py-3 text-sm')}>
        <RiskBadge level={connection.risk_level} tooltip={connection.risk_level} />
      </td>

      <td className={clsx('px-4 py-3 text-sm', 'flex gap-2')}>
        <button
          onClick={() => onEdit(connection)}
          className={clsx('p-2 rounded hover:bg-opacity-50', themeClasses.bg.tertiary)}
          title="Edit"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Delete connection "${connection.connection_name}"?`)) {
              onDelete(connection.asset_id);
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

function CreateEditModal({ connection, onClose, onSave }: { connection?: ExternalConnection; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    connection_name: connection?.connection_name || '',
    connection_type: connection?.connection_type || 'Internet',
    source_system: connection?.source_system || '',
    destination_system: connection?.destination_system || '',
    protocol: connection?.protocol || 'HTTPS',
    encryption: connection?.encryption || 'TLS 1.3',
    owner_team: connection?.owner_team || '',
    owner_email: connection?.owner_email || '',
    is_active: connection?.is_active ?? true,
    access_controls: connection?.access_controls || '',
    last_monitored: connection?.last_monitored?.split('T')[0] || '',
    notes: connection?.notes || '',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (connection) {
        await api.put(`/api/v1/connections/${connection.asset_id}`, form);
      } else {
        await api.post('/api/v1/connections', form);
      }
    },
    onSuccess: () => {
      toast.success(connection ? 'Connection updated' : 'Connection created');
      onSave();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to save connection');
    },
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-lg shadow-xl w-full max-w-2xl max-h-96 overflow-y-auto', themeClasses.bg.card)}>
        {/* Header */}
        <div className={clsx('px-6 py-4 border-b', themeClasses.border.primary, 'flex justify-between items-center sticky top-0', themeClasses.bg.card)}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>
            {connection ? 'Edit Connection' : 'Create Connection'}
          </h2>
          <button onClick={onClose} className={clsx('text-2xl', themeClasses.text.secondary)}>
            ✕
          </button>
        </div>

        <div className={clsx('px-6 py-6 space-y-4')}>
          {/* Connection Name */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>
              Connection Name *
            </label>
            <input
              type="text"
              value={form.connection_name}
              onChange={(e) => setForm({ ...form, connection_name: e.target.value })}
              placeholder="e.g., AWS Production VPN"
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
          </div>

          {/* Connection Type & Protocol */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Connection Type *</label>
              <select
                value={form.connection_type}
                onChange={(e) => setForm({ ...form, connection_type: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                {CONNECTION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Protocol *</label>
              <select
                value={form.protocol}
                onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                {PROTOCOLS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Source & Destination */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Source System</label>
              <input
                type="text"
                value={form.source_system}
                onChange={(e) => setForm({ ...form, source_system: e.target.value })}
                placeholder="e.g., Corporate Network"
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Destination System</label>
              <input
                type="text"
                value={form.destination_system}
                onChange={(e) => setForm({ ...form, destination_system: e.target.value })}
                placeholder="e.g., AWS Infrastructure"
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
          </div>

          {/* Encryption & Active Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Encryption *</label>
              <select
                value={form.encryption}
                onChange={(e) => setForm({ ...form, encryption: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                {ENCRYPTION_TYPES.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Last Monitored</label>
              <input
                type="date"
                value={form.last_monitored}
                onChange={(e) => setForm({ ...form, last_monitored: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
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
                placeholder="e.g., Infrastructure"
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

          {/* Active Status */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className={clsx('text-sm', themeClasses.text.primary)}>Mark as active</span>
          </label>

          {/* Access Controls */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Access Controls</label>
            <textarea
              value={form.access_controls}
              onChange={(e) => setForm({ ...form, access_controls: e.target.value })}
              placeholder="e.g., IP whitelisting, MFA required, Rate limited"
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
            disabled={!form.connection_name || mutation.isPending}
            className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}
          >
            {mutation.isPending ? 'Saving...' : 'Save Connection'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ExternalConnectionsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ExternalConnection | undefined>();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: response, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['connections', page, search, typeFilter, riskFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        ...(search && { search }),
        ...(typeFilter && { connection_type: typeFilter }),
        ...(riskFilter && { risk_level: riskFilter }),
      });
      const res = await api.get(`/api/v1/connections?${params}`);
      return res.data;
    },
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/connections/${id}`),
    onSuccess: () => {
      toast.success('Connection deleted');
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete'),
  });

  const connections = response?.data || [];
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
            <h1 className={clsx('text-3xl font-bold mb-1', themeClasses.text.primary)}>External Connections</h1>
            <p className={clsx('text-sm', themeClasses.text.secondary)}>Manage network connections and integration points</p>
          </div>
          <button
            onClick={() => {
              setEditingConnection(undefined);
              setShowModal(true);
            }}
            className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}
          >
            <Plus size={20} />
            Add Connection
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
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className={clsx('px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            >
              <option value="">All Connection Types</option>
              {CONNECTION_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
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
          <div className={clsx('text-center p-12', themeClasses.text.secondary)}>Loading connections...</div>
        ) : connections.length === 0 ? (
          <div className={clsx('rounded-lg p-12 text-center', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
            <Lock size={48} className={clsx('mx-auto mb-4', themeClasses.text.secondary)} />
            <p className={clsx('text-lg font-medium mb-2', themeClasses.text.primary)}>No connections yet</p>
            <p className={clsx('text-sm mb-6', themeClasses.text.secondary)}>Create your first external connection to track network integrations and monitor access controls.</p>
            <button
              onClick={() => {
                setEditingConnection(undefined);
                setShowModal(true);
              }}
              className={clsx('inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}
            >
              <Plus size={20} />
              Create Connection
            </button>
          </div>
        ) : (
          <div className={clsx('rounded-lg border overflow-x-auto', themeClasses.bg.card, themeClasses.border.primary)}>
            <table className="w-full">
              <thead className={clsx('border-b', themeClasses.border.primary, themeClasses.bg.secondary)}>
                <tr>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Name</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Type</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Protocol</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Encryption</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Status</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Flags</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Risk</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((connection) => (
                  <ConnectionRow
                    key={connection.asset_id}
                    connection={connection}
                    onEdit={(c) => {
                      setEditingConnection(c);
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

      {showModal && <CreateEditModal key={editingConnection?.asset_id} connection={editingConnection} onClose={() => setShowModal(false)} onSave={() => queryClient.invalidateQueries({ queryKey: ['connections'] })} />}
    </div>
  );
}
