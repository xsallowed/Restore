import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Eye, Edit2, Trash2, FileUp, Database,
  Zap, Network, Radio, ChevronDown, Server, Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';
import { Asset, AssetStatus, AssetType, PaginatedResponse } from '../../modules/asset-registry/types';
import { CSVImportModal } from '../../components/asset-registry/CSVImportModal';
import { StatusBadge } from '../../components/asset-registry/StatusBadge';

const ASSET_TYPES = [
  'Server','Workstation','Laptop','Mobile','NetworkDevice',
  'VM','CloudInstance','IoT','Unknown',
];
const STATUSES = ['Active','Inactive','Decommissioned','Unknown','Unverified'];

// ─── Portal Dropdown ──────────────────────────────────────────────────────────
// Renders the dropdown menu directly into document.body so it is NEVER clipped
// by any ancestor's overflow:hidden or overflow-x:auto.

interface DropdownMenuItem {
  label: string;
  icon: React.ElementType;
  description: string;
  onClick: () => void;
}

function PortalDropdown({
  triggerRef,
  isOpen,
  items,
  onClose,
}: {
  triggerRef: React.RefObject<HTMLButtonElement>;
  isOpen: boolean;
  items: DropdownMenuItem[];
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, right: 0 });

  // Recalculate position every time it opens
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + window.scrollY + 6,
      right: window.innerWidth - rect.right,
    });
  }, [isOpen, triggerRef]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{ position: 'absolute', top: pos.top, right: pos.right, zIndex: 9999, width: 272 }}
      className={clsx(
        'rounded-xl shadow-2xl border',
        themeClasses.bg.card,
        themeClasses.border.primary,
      )}
    >
      <div className="p-1.5">
        {items.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent outside-click handler from firing first
                item.onClick();
                onClose();
              }}
              className={clsx(
                'w-full text-left px-3 py-3 rounded-lg flex items-start gap-3 transition-colors',
                'hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >
              <Icon size={17} className={clsx('mt-0.5 flex-shrink-0', themeClasses.text.secondary)} />
              <div className="flex-1 min-w-0">
                <p className={clsx('text-sm font-medium', themeClasses.text.primary)}>{item.label}</p>
                <p className={clsx('text-xs mt-0.5', themeClasses.text.secondary)}>{item.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}

// ─── Add Assets Button + Dropdown ─────────────────────────────────────────────

function AddAssetsDropdown({
  onManualAdd,
  onCSVImport,
  onAPIConnector,
  onActiveNmap,
  onAgents,
  onPCAPDiscovery,
  onDNSDiscovery,
}: {
  onManualAdd: () => void;
  onCSVImport: () => void;
  onAPIConnector: () => void;
  onActiveNmap: () => void;
  onAgents: () => void;
  onPCAPDiscovery: () => void;
  onDNSDiscovery: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const items: DropdownMenuItem[] = [
    { label: 'Manual Entry',       icon: Plus,     onClick: onManualAdd,    description: 'Add a single asset manually' },
    { label: 'Import CSV',         icon: FileUp,   onClick: onCSVImport,   description: 'Bulk import from a CSV file' },
    { label: 'API Connector',      icon: Database, onClick: onAPIConnector, description: 'Sync from Intune, ServiceNow, CrowdStrike…' },
    { label: 'Active Scan',        icon: Zap,      onClick: onActiveNmap,  description: 'Discover via network scan (ICMP / Nmap)' },
    { label: 'Remote Agent',       icon: Server,   onClick: onAgents,       description: 'Deploy agent on a remote network segment' },
    { label: 'PCAP Discovery',     icon: Network,  onClick: onPCAPDiscovery, description: 'Discover from packet capture' },
    { label: 'DNS Discovery',      icon: Radio,    onClick: onDNSDiscovery, description: 'Discover from DNS logs' },
  ];

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setIsOpen((o) => !o)}
        className={clsx(
          'flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white text-sm',
          themeClasses.button.primary,
        )}
      >
        <Plus size={18} />
        Add Assets
        <ChevronDown size={15} className={clsx('transition-transform', isOpen && 'rotate-180')} />
      </button>

      <PortalDropdown
        triggerRef={triggerRef}
        isOpen={isOpen}
        items={items}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

// ─── Add Asset Modal ──────────────────────────────────────────────────────────

function AddAssetModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({
    hostname: '', display_name: '', asset_type: 'Server',
    primary_ip_address: '', os_name: '', status: 'Active',
  });

  const mutation = useMutation({
    mutationFn: () => api.post('/api/v1/assets', form),
    onSuccess: () => { toast.success('Asset created'); onAdded(); onClose(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create asset'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-xl shadow-2xl w-full max-w-md', themeClasses.bg.card)}>
        <div className={clsx('px-6 py-4 border-b flex justify-between items-center', themeClasses.border.primary)}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>Add New Asset</h2>
          <button onClick={onClose} className={clsx('text-xl', themeClasses.text.secondary)}>✕</button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {[
            { label: 'Hostname *', key: 'hostname', placeholder: 'e.g. prod-db-01' },
            { label: 'Display Name', key: 'display_name', placeholder: 'Friendly name' },
            { label: 'IP Address', key: 'primary_ip_address', placeholder: '192.168.1.100' },
            { label: 'Operating System', key: 'os_name', placeholder: 'e.g. Windows Server 2022' },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>{label}</label>
              <input
                type="text" value={(form as any)[key]} placeholder={placeholder}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
          ))}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Asset Type</label>
            <select value={form.asset_type} onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
              className={clsx('w-full px-3 py-2 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
              {ASSET_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
              className={clsx('w-full px-3 py-2 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className={clsx('px-6 py-4 border-t flex gap-3 justify-end', themeClasses.border.primary)}>
          <button onClick={onClose} className={clsx('px-4 py-2 rounded-lg text-sm', themeClasses.button.secondary)}>Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!form.hostname || mutation.isPending}
            className={clsx('px-4 py-2 rounded-lg text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}>
            {mutation.isPending ? 'Creating…' : 'Create Asset'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Asset Row ────────────────────────────────────────────────────────────────

function AssetRow({ asset, onNavigate, onEdit, onDelete }: {
  asset: Asset;
  onNavigate: (id: string) => void;
  onEdit: (a: Asset) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr className={clsx('border-t cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors', themeClasses.border.primary)}
      onClick={() => onNavigate(asset.id)}>
      <td className={clsx('px-4 py-3 text-sm font-medium', themeClasses.text.primary)}>{asset.hostname}</td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{asset.asset_type}</td>
      <td className={clsx('px-4 py-3 text-sm font-mono', themeClasses.text.secondary)}>{asset.primary_ip_address || '—'}</td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{asset.os_name || '—'}</td>
      <td className="px-4 py-3"><StatusBadge status={asset.status} variant="status" /></td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{asset.discovery_source || '—'}</td>
      <td className={clsx('px-4 py-3 text-xs', themeClasses.text.secondary)}>
        {asset.last_seen ? new Date(asset.last_seen).toLocaleDateString() : '—'}
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1.5">
          <button onClick={() => onNavigate(asset.id)} title="View"
            className={clsx('p-1.5 rounded', themeClasses.bg.secondary, 'hover:opacity-80')}>
            <Eye size={13} className={themeClasses.text.secondary} />
          </button>
          <button onClick={() => onEdit(asset)} title="Edit"
            className={clsx('p-1.5 rounded', themeClasses.bg.secondary, 'hover:opacity-80')}>
            <Edit2 size={13} className={themeClasses.text.secondary} />
          </button>
          <button onClick={() => { if (confirm('Delete this asset?')) onDelete(asset.id); }} title="Delete"
            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30">
            <Trash2 size={13} className="text-red-500" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AssetRegistryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ status: '', asset_type: '' });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  const limit = 20;

  const { data, isLoading, isError } = useQuery<PaginatedResponse<Asset>>({
    queryKey: ['assets', page, search, filters],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search)          params.set('search', search);
      if (filters.status)  params.set('status', filters.status);
      if (filters.asset_type) params.set('asset_type', filters.asset_type);
      const res = await api.get(`/api/v1/assets?${params}`);
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/assets/${id}`),
    onSuccess: () => { toast.success('Asset deleted'); queryClient.invalidateQueries({ queryKey: ['assets'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const assets = data?.data ?? [];
  const total_pages = data?.total_pages ?? 0;

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className={clsx('text-3xl font-bold', themeClasses.text.primary)}>Asset Registry</h1>
            <p className={clsx('text-sm mt-1', themeClasses.text.secondary)}>
              Discover, manage and monitor your IT assets
            </p>
          </div>
          {/* NOTE: AddAssetsDropdown renders its menu into document.body via a portal
              so it is never clipped by any overflow:hidden ancestor */}
          <AddAssetsDropdown
            onManualAdd={() => setShowAddModal(true)}
            onCSVImport={() => setShowCSVImport(true)}
            onAPIConnector={() => navigate('/assets/connectors')}
            onActiveNmap={() => navigate('/assets/scan')}
            onAgents={() => navigate('/assets/agents')}
            onPCAPDiscovery={() => { toast('Check Discovery Inbox'); navigate('/assets/discovery'); }}
            onDNSDiscovery={() => { toast('Check Discovery Inbox'); navigate('/assets/discovery'); }}
          />
        </div>

        {/* Filters */}
        <div className={clsx('rounded-xl border p-4 flex gap-3 flex-wrap items-center', themeClasses.bg.card, themeClasses.border.primary)}>
          <div className="flex-1 min-w-56 flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
            <Search size={16} className={themeClasses.text.secondary} />
            <input type="text" placeholder="Search hostname, IP, asset ID…" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className={clsx('flex-1 bg-transparent outline-none text-sm', themeClasses.text.primary)} />
          </div>
          <select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}
            className={clsx('px-3 py-2 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={filters.asset_type} onChange={(e) => { setFilters({ ...filters, asset_type: e.target.value }); setPage(1); }}
            className={clsx('px-3 py-2 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
            <option value="">All Types</option>
            {ASSET_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        {/* Table — NOTE: overflow-hidden removed, overflow-x-auto only */}
        <div className={clsx('rounded-xl border', themeClasses.bg.card, themeClasses.border.primary, 'overflow-x-auto')}>
          {isLoading ? (
            <div className={clsx('p-12 text-center', themeClasses.text.secondary)}>Loading assets…</div>
          ) : isError ? (
            <div className="p-12 text-center text-red-500">Error loading assets. Check your connection.</div>
          ) : assets.length === 0 ? (
            <div className={clsx('p-12 text-center', themeClasses.text.secondary)}>
              <Server size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">No assets found</p>
              <p className="text-xs mt-1">Use the Add Assets button to get started</p>
            </div>
          ) : (
            <table className="w-full text-sm min-w-[900px]">
              <thead className={clsx('text-xs uppercase tracking-wide', themeClasses.text.secondary, 'bg-gray-50 dark:bg-gray-800/50')}>
                <tr>
                  {['Hostname','Type','IP Address','OS','Status','Source','Last Seen','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assets.map(asset => (
                  <AssetRow key={asset.id} asset={asset}
                    onNavigate={(id) => navigate(`/assets/${id}`)}
                    onEdit={(a) => setEditingAsset(a)}
                    onDelete={(id) => deleteMutation.mutate(id)} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {total_pages > 1 && (
          <div className="flex justify-center items-center gap-3">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className={clsx('px-3 py-1.5 rounded-lg border text-sm', themeClasses.border.primary, themeClasses.text.primary, 'disabled:opacity-40')}>
              ← Previous
            </button>
            <span className={clsx('text-sm', themeClasses.text.secondary)}>Page {page} of {total_pages}</span>
            <button onClick={() => setPage(p => Math.min(total_pages, p + 1))} disabled={page === total_pages}
              className={clsx('px-3 py-1.5 rounded-lg border text-sm', themeClasses.border.primary, themeClasses.text.primary, 'disabled:opacity-40')}>
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddAssetModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => queryClient.invalidateQueries({ queryKey: ['assets'] })} />
      )}
      {showCSVImport && <CSVImportModal onClose={() => setShowCSVImport(false)} />}
      {editingAsset && (
        <AddAssetModal
          onClose={() => setEditingAsset(null)}
          onAdded={() => queryClient.invalidateQueries({ queryKey: ['assets'] })} />
      )}
    </div>
  );
}
