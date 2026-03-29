import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Download, Upload, Filter, Eye, Edit2, Trash2, ChevronRight, ChevronDown, FileUp, Zap, Network, Radio, Database } from 'lucide-react';
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
  os_name?: string;
  os_version?: string;
  os_build?: string;
  primary_ip_address?: string;
  secondary_ip_addresses?: string[];
  mac_addresses?: string[];
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  cpu_cores?: number;
  ram_gb?: number;
  storage_gb?: number;
  site_name?: string;
  building?: string;
  room?: string;
  business_unit?: string;
  owner_name?: string;
  owner_email?: string;
  secondary_contact_name?: string;
  status: string;
  purchase_date?: string;
  warranty_expiry_date?: string;
  end_of_life_date?: string;
  cve_count?: number;
  last_vuln_scan_date?: string;
  patch_level?: string;
  confidence_score: number;
  last_seen?: string;
  discovery_source?: string;
  verification_status?: string;
  tags: string[];
  notes?: string;
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

function AssetRow({
  asset,
  onEdit,
  onDelete,
  onNavigate,
  isSelected,
  onSelect,
}: {
  asset: Asset;
  onEdit: (asset: Asset) => void;
  onDelete: (id: string) => void;
  onNavigate: (id: string) => void;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
}) {
  return (
    <tr className={clsx('border-b', themeClasses.border.primary, 'hover:bg-opacity-50 transition-colors', isSelected && 'bg-purple-100 dark:bg-purple-900 bg-opacity-30')}>
      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(asset.id, e.target.checked)}
          className="w-4 h-4 rounded cursor-pointer"
        />
      </td>
      <td className={clsx('px-4 py-4 text-xs font-mono', themeClasses.text.secondary)} title={asset.asset_id}>
        {asset.asset_id.substring(0, 8)}
      </td>
      <td className={clsx('px-4 py-4 cursor-pointer', themeClasses.text.primary)} onClick={() => onNavigate(asset.id)}>
        <div className="font-medium text-sm">{asset.hostname}</div>
        {asset.display_name && <div className={clsx('text-xs', themeClasses.text.secondary)}>{asset.display_name}</div>}
      </td>
      <td className={clsx('px-4 py-4 text-sm', themeClasses.text.secondary)}>{asset.asset_type}</td>
      <td className={clsx('px-4 py-4 text-xs', themeClasses.text.secondary)}>
        {asset.os_name} {asset.os_version && `v${asset.os_version}`}
        {asset.os_build && <div className={clsx('text-xs', themeClasses.text.secondary)}>{asset.os_build}</div>}
      </td>
      <td className={clsx('px-4 py-4 text-sm font-mono', themeClasses.text.secondary)} title={asset.primary_ip_address || 'N/A'}>
        {asset.primary_ip_address || '—'}
      </td>
      <td className={clsx('px-4 py-4 text-xs', themeClasses.text.secondary)}>
        {asset.mac_addresses && asset.mac_addresses.length > 0 ? asset.mac_addresses[0].substring(0, 12) : '—'}
      </td>
      <td className={clsx('px-4 py-4 text-sm', themeClasses.text.secondary)}>
        {asset.manufacturer && `${asset.manufacturer} ${asset.model || ''}`}
      </td>
      <td className={clsx('px-4 py-4 text-sm', themeClasses.text.secondary)}>
        {asset.site_name && `${asset.site_name}${asset.room ? ` - ${asset.room}` : ''}`}
      </td>
      <td className={clsx('px-4 py-4 text-sm', themeClasses.text.secondary)}>
        {asset.business_unit || '—'}
      </td>
      <td className={clsx('px-4 py-4 text-sm', themeClasses.text.secondary)} title={asset.owner_name || 'N/A'}>
        {asset.owner_name || '—'}
      </td>
      <td className="px-4 py-4">
        <StatusBadge status={asset.status} variant="status" />
      </td>
      <td className={clsx('px-4 py-4 text-sm font-bold', asset.confidence_score >= 75 ? 'text-green-600 dark:text-green-400' : asset.confidence_score >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400')}>
        {asset.confidence_score}%
      </td>
      <td className={clsx('px-4 py-4 text-xs', themeClasses.text.secondary)}>
        {asset.discovery_source || '—'}
      </td>
      <td className={clsx('px-4 py-4 text-xs', themeClasses.text.secondary)}>
        {asset.last_seen ? new Date(asset.last_seen).toLocaleDateString() : '—'}
      </td>
      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-2">
          <button
            onClick={() => onNavigate(asset.id)}
            className={clsx('p-2 rounded hover:bg-opacity-80 transition-colors', themeClasses.bg.tertiary)}
            title="View Details"
          >
            <Eye size={14} className={themeClasses.text.secondary} />
          </button>
          <button
            onClick={() => onEdit(asset)}
            className={clsx('p-2 rounded hover:bg-opacity-80 transition-colors', themeClasses.bg.tertiary)}
            title="Edit"
          >
            <Edit2 size={14} className={themeClasses.text.secondary} />
          </button>
          <button
            onClick={() => onDelete(asset.id)}
            className={clsx('p-2 rounded hover:bg-red-100 dark:hover:bg-red-900 transition-colors')}
            title="Delete"
          >
            <Trash2 size={14} className="text-red-600 dark:text-red-400" />
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

function AddAssetsDropdown({
  onManualAdd,
  onCSVImport,
  onAPIConnector,
  onActiveNmap,
  onPCAPDiscovery,
  onDNSDiscovery,
}: {
  onManualAdd: () => void;
  onCSVImport: () => void;
  onAPIConnector: () => void;
  onActiveNmap: () => void;
  onPCAPDiscovery: () => void;
  onDNSDiscovery: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menuItems = [
    { label: 'Manual Entry', icon: Plus, onClick: onManualAdd, description: 'Add a single asset manually' },
    { label: 'Import CSV', icon: FileUp, onClick: onCSVImport, description: 'Bulk import from CSV file' },
    { label: 'API Connector', icon: Database, onClick: onAPIConnector, description: 'Sync from API connectors (Intune, ServiceNow)' },
    { label: 'Active Scan (Nmap)', icon: Zap, onClick: onActiveNmap, description: 'Discover via network scanning' },
    { label: 'PCAP Discovery', icon: Network, onClick: onPCAPDiscovery, description: 'Discover from packet capture' },
    { label: 'DNS Discovery', icon: Radio, onClick: onDNSDiscovery, description: 'Discover from DNS logs' },
  ];

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}
      >
        <Plus size={20} />
        Add Assets
        <ChevronDown size={16} className={clsx('transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div
          className={clsx(
            'absolute right-0 mt-2 w-64 rounded-lg shadow-xl z-50 border',
            themeClasses.bg.card,
            themeClasses.border.primary
          )}
        >
          <div className={clsx('p-2')}>
            {menuItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  onClick={() => {
                    item.onClick();
                    setIsOpen(false);
                  }}
                  className={clsx(
                    'w-full text-left px-3 py-3 rounded flex items-start gap-3 hover:bg-opacity-80 transition-colors',
                    themeClasses.bg.secondary
                  )}
                >
                  <Icon size={18} className={clsx('mt-0.5 flex-shrink-0', themeClasses.text.secondary)} />
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-sm font-medium', themeClasses.text.primary)}>{item.label}</p>
                    <p className={clsx('text-xs', themeClasses.text.secondary)}>{item.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
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
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
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
          <AddAssetsDropdown
            onManualAdd={() => setShowAddModal(true)}
            onCSVImport={() => setShowCSVImport(true)}
            onAPIConnector={() => toast.info('API Connector sync coming soon. Configure connectors in Settings.')}
            onActiveNmap={() => toast.info('Active Nmap scanning coming soon. Use Discovery page.')}
            onPCAPDiscovery={() => toast.info('PCAP discovery coming soon. Check Discovery Inbox.')}
            onDNSDiscovery={() => toast.info('DNS discovery coming soon. Check Discovery Inbox.')}
          />
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

        {/* Bulk Actions Bar */}
        {selectedAssets.size > 0 && (
          <div className={clsx('rounded-lg p-4 mb-4', themeClasses.bg.secondary, 'border', themeClasses.border.primary)}>
            <div className="flex items-center justify-between">
              <span className={clsx('font-medium', themeClasses.text.primary)}>
                {selectedAssets.size} asset{selectedAssets.size !== 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedAssets(new Set())}
                  className={clsx('px-3 py-2 rounded text-sm', themeClasses.button.secondary)}
                >
                  Clear Selection
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete ${selectedAssets.size} selected asset(s)?`)) {
                      selectedAssets.forEach((id) => deleteMutation.mutate(id));
                      setSelectedAssets(new Set());
                    }
                  }}
                  className={clsx('px-3 py-2 rounded text-sm font-medium text-white', 'bg-red-600 hover:bg-red-700')}
                >
                  Delete Selected
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Assets Table */}
        <div className={clsx('rounded-lg overflow-hidden border', themeClasses.bg.card, themeClasses.border.primary, 'overflow-x-auto')}>
          {isLoading ? (
            <div className={clsx('p-12 text-center', themeClasses.text.secondary)}>Loading assets...</div>
          ) : isError ? (
            <div className={clsx('p-12 text-center text-red-600')}>Error loading assets</div>
          ) : assets.length === 0 ? (
            <div className={clsx('p-12 text-center', themeClasses.text.secondary)}>No assets found</div>
          ) : (
            <table className="w-full min-w-max">
              <thead className={clsx('border-b sticky top-0', themeClasses.bg.tertiary, themeClasses.border.primary)}>
                <tr>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold', themeClasses.text.secondary)}>
                    <input
                      type="checkbox"
                      checked={selectedAssets.size === assets.length && assets.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAssets(new Set(assets.map((a) => a.id)));
                        } else {
                          setSelectedAssets(new Set());
                        }
                      }}
                      className="w-4 h-4 rounded cursor-pointer"
                    />
                  </th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>ID</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>Hostname</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>Type</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>OS</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>IP Address</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>MAC</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>Hardware</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>Location</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>Business Unit</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>Owner</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>Status</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>Confidence</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>Source</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>Last Seen</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase', themeClasses.text.secondary)}>Actions</th>
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
                    isSelected={selectedAssets.has(asset.id)}
                    onSelect={(id, selected) => {
                      const newSelected = new Set(selectedAssets);
                      if (selected) {
                        newSelected.add(id);
                      } else {
                        newSelected.delete(id);
                      }
                      setSelectedAssets(newSelected);
                    }}
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
