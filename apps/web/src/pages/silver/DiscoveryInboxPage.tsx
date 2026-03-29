import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Check, X, Shield, AlertCircle, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface DiscoveredAsset {
  id: string;
  hostname?: string;
  ip_addresses: string[];
  mac_addresses: string[];
  evidence_source: string;
  confidence_score: number;
  last_seen?: string;
  status: 'Pending' | 'Confirmed' | 'Merged' | 'Dismissed';
  evidence_details?: Record<string, unknown>;
  created_at: string;
}

const SOURCE_COLORS: Record<string, string> = {
  'PCAP': 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
  'DNS': 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200',
  'NetFlow': 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
  'SNMP': 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
  'Nmap': 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200',
  'Intune': 'bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200',
};

function ConfidenceBar({ score }: { score: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className={clsx('text-xs font-medium', themeClasses.text.secondary)}>Confidence</span>
        <span className={clsx('text-sm font-bold', score >= 75 ? 'text-green-600 dark:text-green-400' : score >= 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400')}>
          {score}%
        </span>
      </div>
      <div className={clsx('w-full h-2 rounded-full overflow-hidden', themeClasses.bg.tertiary)}>
        <div
          className={clsx('h-full rounded-full transition-all', score >= 75 ? 'bg-green-500' : score >= 50 ? 'bg-yellow-500' : 'bg-red-500')}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function DiscoveryCard({
  asset,
  onConfirm,
  onDismiss,
}: {
  asset: DiscoveredAsset;
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const sourceColor = SOURCE_COLORS[asset.evidence_source] || 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';

  return (
    <div className={clsx('rounded-lg border p-4', themeClasses.bg.card, themeClasses.border.primary, 'space-y-3')}>
      {/* Header */}
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Shield size={18} className={themeClasses.text.secondary} />
            <h3 className={clsx('font-semibold', themeClasses.text.primary)}>
              {asset.hostname || 'Unknown Host'}
            </h3>
          </div>
          <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>
            ID: {asset.id.substring(0, 8)}
          </p>
        </div>
        <span className={clsx('px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap', sourceColor)}>
          {asset.evidence_source}
        </span>
      </div>

      {/* Network Details */}
      <div className={clsx('space-y-2 p-3 rounded', themeClasses.bg.secondary)}>
        <div>
          <p className={clsx('text-xs font-medium mb-1', themeClasses.text.secondary)}>IP Addresses</p>
          <div className="flex flex-wrap gap-2">
            {asset.ip_addresses.map((ip) => (
              <code
                key={ip}
                className={clsx('px-2 py-1 rounded text-xs', themeClasses.bg.tertiary, themeClasses.text.primary)}
              >
                {ip}
              </code>
            ))}
          </div>
        </div>

        {asset.mac_addresses.length > 0 && (
          <div>
            <p className={clsx('text-xs font-medium mb-1', themeClasses.text.secondary)}>MAC Addresses</p>
            <div className="flex flex-wrap gap-2">
              {asset.mac_addresses.map((mac) => (
                <code
                  key={mac}
                  className={clsx('px-2 py-1 rounded text-xs', themeClasses.bg.tertiary, themeClasses.text.primary)}
                >
                  {mac}
                </code>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confidence Score */}
      <ConfidenceBar score={asset.confidence_score} />

      {/* Evidence Details */}
      {asset.evidence_details && Object.keys(asset.evidence_details).length > 0 && (
        <details className={clsx('text-xs', themeClasses.text.secondary)}>
          <summary className="cursor-pointer font-medium">Evidence Details</summary>
          <pre className={clsx('mt-2 p-2 rounded overflow-x-auto', themeClasses.bg.secondary, 'text-xs')}>
            {JSON.stringify(asset.evidence_details, null, 2)}
          </pre>
        </details>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {asset.status === 'Pending' && (
          <>
            <button
              onClick={() => onConfirm(asset.id)}
              className={clsx('flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded font-medium text-white', themeClasses.button.primary, 'hover:bg-opacity-90')}
            >
              <Check size={16} />
              Add to Registry
            </button>
            <button
              onClick={() => onDismiss(asset.id)}
              className={clsx('flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded font-medium', themeClasses.button.secondary)}
            >
              <X size={16} />
              Dismiss
            </button>
          </>
        )}
        {asset.status === 'Confirmed' && (
          <div className={clsx('w-full px-4 py-2 rounded text-center text-sm font-medium flex items-center justify-center gap-2', 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200')}>
            <Check size={16} />
            Added to Registry
          </div>
        )}
        {asset.status === 'Dismissed' && (
          <div className={clsx('w-full px-4 py-2 rounded text-center text-sm font-medium flex items-center justify-center gap-2', 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200')}>
            <X size={16} />
            Dismissed
          </div>
        )}
      </div>
    </div>
  );
}

export function DiscoveryInboxPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<'Pending' | 'All'>('Pending');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const queryClient = useQueryClient();

  const { data: inboxData, isLoading, isError } = useQuery({
    queryKey: ['discovery-inbox', statusFilter, sourceFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        ...(statusFilter !== 'All' && { status: statusFilter }),
        ...(sourceFilter && { source: sourceFilter }),
      });
      const response = await api.get(`/api/v1/discovery/inbox?${params}`);
      return response.data;
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/discovery/inbox/${id}/confirm`),
    onSuccess: () => {
      toast.success('Asset confirmed and added to registry');
      queryClient.invalidateQueries({ queryKey: ['discovery-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to confirm asset'),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/discovery/inbox/${id}`),
    onSuccess: () => {
      toast.success('Asset dismissed');
      queryClient.invalidateQueries({ queryKey: ['discovery-inbox'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to dismiss asset'),
  });

  const assets: DiscoveredAsset[] = inboxData?.data || [];
  const pendingCount = assets.filter((a) => a.status === 'Pending').length;

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Back Button */}
        <button onClick={() => navigate('/assets')} className={clsx('flex items-center gap-2 mb-4', themeClasses.text.primary, 'hover:opacity-70 transition')}>
          <ArrowLeft size={20} />
          Back to Assets
        </button>

        {/* Header */}
        <div className={themeClasses.text.primary}>
          <h1 className="text-3xl font-bold mb-1">Discovery Inbox</h1>
          <p className={clsx('text-sm', themeClasses.text.secondary)}>
            Review and approve newly discovered assets ({pendingCount} pending)
          </p>
        </div>

        {/* Filters */}
        <div className={clsx('rounded-lg p-4 space-y-3', themeClasses.bg.secondary)}>
          <div className="flex gap-4 flex-wrap">
            <div>
              <label className={clsx('block text-xs font-medium mb-2', themeClasses.text.secondary)}>
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className={clsx('px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                <option value="Pending">Pending Only</option>
                <option value="All">All</option>
              </select>
            </div>

            <div>
              <label className={clsx('block text-xs font-medium mb-2', themeClasses.text.secondary)}>
                Source
              </label>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className={clsx('px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                <option value="">All Sources</option>
                <option value="PCAP">PCAP</option>
                <option value="DNS">DNS</option>
                <option value="NetFlow">NetFlow</option>
                <option value="SNMP">SNMP</option>
                <option value="Nmap">Nmap</option>
              </select>
            </div>
          </div>
        </div>

        {/* Discovery Cards Grid */}
        {isLoading ? (
          <div className={clsx('text-center p-12', themeClasses.text.secondary)}>
            Loading discovered assets...
          </div>
        ) : isError ? (
          <div className={clsx('text-center p-12 text-red-600')}>
            Error loading discovery inbox
          </div>
        ) : assets.length === 0 ? (
          <div className={clsx('text-center p-12 rounded-lg', themeClasses.bg.card)}>
            <AlertCircle size={48} className={clsx('mx-auto mb-3', themeClasses.text.secondary)} />
            <p className={clsx('font-medium', themeClasses.text.primary)}>No discovered assets</p>
            <p className={clsx('text-sm', themeClasses.text.secondary)}>
              Enable passive discovery or run active scans to discover assets
            </p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            {assets.map((asset) => (
              <DiscoveryCard
                key={asset.id}
                asset={asset}
                onConfirm={(id) => confirmMutation.mutate(id)}
                onDismiss={(id) => dismissMutation.mutate(id)}
              />
            ))}
          </div>
        )}

        {/* Stats */}
        {assets.length > 0 && (
          <div className={clsx('grid grid-cols-4 gap-4', 'rounded-lg p-4', themeClasses.bg.card)}>
            <div>
              <p className={clsx('text-xs', themeClasses.text.secondary)}>Total Discovered</p>
              <p className={clsx('text-2xl font-bold', themeClasses.text.primary)}>{assets.length}</p>
            </div>
            <div>
              <p className={clsx('text-xs', themeClasses.text.secondary)}>Pending Review</p>
              <p className={clsx('text-2xl font-bold text-yellow-600 dark:text-yellow-400')}>{pendingCount}</p>
            </div>
            <div>
              <p className={clsx('text-xs', themeClasses.text.secondary)}>Confirmed</p>
              <p className={clsx('text-2xl font-bold text-green-600 dark:text-green-400')}>
                {assets.filter((a) => a.status === 'Confirmed').length}
              </p>
            </div>
            <div>
              <p className={clsx('text-xs', themeClasses.text.secondary)}>Dismissed</p>
              <p className={clsx('text-2xl font-bold text-gray-600 dark:text-gray-400')}>
                {assets.filter((a) => a.status === 'Dismissed').length}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
