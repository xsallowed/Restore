import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Download, Upload, Filter, Eye, Edit2, Trash2, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';
import { CSVImportModal } from '../../components/asset-registry/CSVImportModal';

interface Asset {
  id: string;
  asset_id: string;
  hostname: string;
  display_name?: string;
  asset_type: string;
  primary_ip_address?: string;
  status: string;
  discovery_source?: string;
  verification_status?: string;
  confidence_score: number;
  owner_name?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

const ASSET_TYPES = ['Server', 'Workstation', 'Laptop', 'Mobile', 'NetworkDevice', 'VM', 'CloudInstance', 'IoT', 'Unknown'];
const STATUSES = ['Active', 'Inactive', 'Decommissioned', 'Unknown', 'Unverified'];
const VERIFICATION_STATUSES = ['Online', 'Offline', 'Degraded', 'Unknown'];

function StatusBadge({ status, variant = 'status' }: { status: string; variant?: 'status' | 'verification' }) {
  const statusColors: Record<string, string> = {
    // Status
    'Active': 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
    'Inactive': 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
    'Decommissioned': 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
    'Unknown': 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
    'Unverified': 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
    // Verification
    'Online': 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
    'Offline': 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
    'Degraded': 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
  };

  return (
    <span className={clsx('px-3 py-1 rounded-full text-xs font-medium', statusColors[status] || statusColors['Unknown'])}>
      {status}
    </span>
  );
}

function AssetRow({ asset, onEdit, onDelete, onNavigate }: { asset: Asset; onEdit: (asset: Asset) => void; onDelete: (id: string) => void; onNavigate: (id: string) => void }) {
  return (
    <tr className={clsx('border-b', themeClasses.border.primary, 'hover:bg-opacity-50 transition-colors cursor-pointer')} onClick={() => onNavigate(asset.id)}>
      <td className={clsx('px-6 py-4', themeClasses.text.primary)}>
        <div className="font-medium">{asset.hostname}</div>
        <div className={clsx('text-xs', themeClasses.text.secondary)}>{asset.asset_id}</div>
      </td>
      <td className={clsx('px-6 py-4', themeClasses.text.secondary)}>{asset.asset_type}</td>
      <td className={clsx('px-6 py-4', themeClasses.text.secondary)}>{asset.primary_ip_address || '—'}</td>
      <td className="px-6 py-4">
        <StatusBadge status={asset.status} variant="status" />
      </td>
      <td className="px-6 py-4">
        {asset.verification_status ? (
          <StatusBadge status={asset.verification_status} variant="verification" />
        ) : (
          <span className={clsx('text-xs', themeClasses.text.secondary)}>—</span>
        )}
      </td>
      <td className={clsx('px-6 py-4 text-xs', themeClasses.text.secondary)}>
        {asset.discovery_source || '—'}
      </td>
      <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(asset)}
            className={clsx('p-2 rounded hover:bg-opacity-80 transition-colors', themeClasses.bg.tertiary)}
            title="Edit"
          >
            <Edit2 size={16} className={themeClasses.text.secondary} />
          </button>
          <button
            onClick={() => onDelete(asset.id)}
            className={clsx('p-2 rounded hover:bg-red-100 dark:hover:bg-red-900 transition-colors')}
            title="Delete"
          >
            <Trash2 size={16} className="text-red-600 dark:text-red-400" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AddAssetModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    hostname: '',
    display_name: '',
    asset_type: 'Server',
    primary_ip_address: '',
    os_name: '',
    status: 'Active',
  });

  const mutation = useMutation({
    mutationFn: () => api.post('/api/v1/assets', form),
    onSuccess: () => {
      toast.success('Asset created successfully');
      onAdded();
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create asset'),
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={clsx('rounded-lg shadow-xl w-full max-w-md mx-4', themeClasses.bg.card)}>
        <div className={clsx('px-6 py-4 border-b', themeClasses.border.primary, 'flex justify-between items-center')}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>Add New Asset</h2>
          <button onClick={onClose} className={themeClasses.text.secondary}>
            ✕
          </button>
        </div>

        <div className={clsx('px-6 py-4 space-y-4', 'max-h-96 overflow-y-auto')}>
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>
              Hostname *
            </label>
            <input
              type="text"
              value={form.hostname}
              onChange={(e) => setForm({ ...form, hostname: e.target.value })}
              placeholder="e.g., prod-db-01"
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
          </div>

          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>
              Display Name
            </label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="Friendly name"
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>
                Asset Type
              </label>
              <select
                value={form.asset_type}
                onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>
              IP Address
            </label>
            <input
              type="text"
              value={form.primary_ip_address}
              onChange={(e) => setForm({ ...form, primary_ip_address: e.target.value })}
              placeholder="e.g., 192.168.1.100"
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
          </div>

          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>
              OS Name
            </label>
            <input
              type="text"
              value={form.os_name}
              onChange={(e) => setForm({ ...form, os_name: e.target.value })}
              placeholder="e.g., Linux, Windows Server 2019"
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
          </div>
        </div>

        <div className={clsx('px-6 py-4 border-t', themeClasses.border.primary, 'flex gap-3 justify-end')}>
          <button
            onClick={onClose}
            className={clsx('px-4 py-2 rounded text-sm font-medium', themeClasses.bg.tertiary, themeClasses.text.primary, 'hover:bg-opacity-80')}
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.hostname || mutation.isPending}
            className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}
          >
            {mutation.isPending ? 'Creating...' : 'Create Asset'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AssetRegistryPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: [] as string[], asset_type: [] as string[] });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const queryClient = useQueryClient();

  const limit = 20;

  const { data: assetsData, isLoading, isError } = useQuery<PaginatedResponse<Asset>>({
    queryKey: ['assets', page, search, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        ...(search && { search }),
        ...(filters.status.length > 0 && { status: filters.status.join(',') }),
        ...(filters.asset_type.length > 0 && { asset_type: filters.asset_type.join(',') }),
      });
      const response = await api.get(`/api/v1/assets?${params}`);
      return response.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/assets/${id}`),
    onSuccess: () => {
      toast.success('Asset deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete asset'),
  });

  const assets = assetsData?.data || [];
  const total = assetsData?.total || 0;
  const total_pages = assetsData?.total_pages || 0;

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className={clsx('flex justify-between items-center', themeClasses.text.primary)}>
          <div>
            <h1 className="text-3xl font-bold mb-1">Asset Registry</h1>
            <p className={clsx('text-sm', themeClasses.text.secondary)}>Discover, manage, and monitor your IT assets</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowCSVImport(true)}
              className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium', themeClasses.button.secondary)}
            >
              <Upload size={20} />
              Import CSV
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}
            >
              <Plus size={20} />
              Add Asset
            </button>
          </div>
        </div>

        {/* Filters & Search */}
        <div className={clsx('rounded-lg p-4', themeClasses.bg.secondary)}>
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-64">
              <div className="flex items-center gap-2 px-3 py-2 rounded border" style={{ borderColor: 'var(--border-color)' }}>
                <Search size={18} className={themeClasses.text.secondary} />
                <input
                  type="text"
                  placeholder="Search by hostname, IP, asset ID..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className={clsx('flex-1 bg-transparent outline-none', themeClasses.text.primary)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <select
                value={filters.status[0] || ''}
                onChange={(e) => setFilters({ ...filters, status: e.target.value ? [e.target.value] : [] })}
                className={clsx('px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                <option value="">All Statuses</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <select
                value={filters.asset_type[0] || ''}
                onChange={(e) => setFilters({ ...filters, asset_type: e.target.value ? [e.target.value] : [] })}
                className={clsx('px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                <option value="">All Types</option>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Assets Table */}
        <div className={clsx('rounded-lg overflow-hidden border', themeClasses.bg.card, themeClasses.border.primary)}>
          {isLoading ? (
            <div className={clsx('p-12 text-center', themeClasses.text.secondary)}>Loading assets...</div>
          ) : isError ? (
            <div className={clsx('p-12 text-center text-red-600')}>Error loading assets</div>
          ) : assets.length === 0 ? (
            <div className={clsx('p-12 text-center', themeClasses.text.secondary)}>No assets found</div>
          ) : (
            <table className="w-full">
              <thead className={clsx('border-b', themeClasses.bg.tertiary, themeClasses.border.primary)}>
                <tr>
                  <th className={clsx('px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>
                    Hostname
                  </th>
                  <th className={clsx('px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>
                    Type
                  </th>
                  <th className={clsx('px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>
                    IP Address
                  </th>
                  <th className={clsx('px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>
                    Status
                  </th>
                  <th className={clsx('px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>
                    Verification
                  </th>
                  <th className={clsx('px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>
                    Source
                  </th>
                  <th className={clsx('px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    onEdit={setEditingAsset}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onNavigate={(id) => navigate(`/assets/${id}`)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {total_pages > 1 && (
          <div className={clsx('flex justify-center items-center gap-2', themeClasses.text.primary)}>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className={clsx('px-3 py-2 rounded border', themeClasses.border.primary, 'disabled:opacity-50')}
            >
              ← Previous
            </button>
            <span className="text-sm">
              Page {page} of {total_pages}
            </span>
            <button
              onClick={() => setPage(Math.min(total_pages, page + 1))}
              disabled={page === total_pages}
              className={clsx('px-3 py-2 rounded border', themeClasses.border.primary, 'disabled:opacity-50')}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {showAddModal && <AddAssetModal onClose={() => setShowAddModal(false)} onAdded={() => queryClient.invalidateQueries({ queryKey: ['assets'] })} />}
      {showCSVImport && <CSVImportModal onClose={() => setShowCSVImport(false)} />}
    </div>
  );
}
