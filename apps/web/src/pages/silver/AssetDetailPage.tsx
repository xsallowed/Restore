import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, Calendar, User, Tag, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface Asset {
  id: string;
  asset_id: string;
  hostname: string;
  display_name?: string;
  asset_type: string;
  primary_ip_address?: string;
  status: string;
  confidence_score: number;
  owner_name?: string;
  tags: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
  software?: Array<{ id: string; name: string; version?: string; vendor?: string }>;
  interfaces?: Array<{ id: string; interface_name?: string; ip_address: string; mac_address?: string }>;
  health_checks?: Array<{ id: string; check_type: string; status: string; response_time_ms?: number; last_checked: string }>;
  audit_log?: Array<{ id: string; action: string; user_id?: string; changed_fields: any; created_at: string }>;
}

type TabType = 'overview' | 'network' | 'software' | 'health' | 'history';

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors',
        active
          ? clsx(themeClasses.bg.tertiary, themeClasses.text.primary, 'border-b-2 border-purple-500')
          : clsx(themeClasses.bg.secondary, themeClasses.text.secondary, 'hover:bg-opacity-80')
      )}
    >
      {children}
    </button>
  );
}

function InfoRow({ label, value, copyable }: { label: string; value?: string; copyable?: boolean }) {
  return (
    <div className="flex justify-between items-center py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
      <span className={clsx('text-sm font-medium', themeClasses.text.secondary)}>{label}</span>
      <div className="flex items-center gap-2">
        <span className={clsx('text-sm', themeClasses.text.primary)}>{value || '—'}</span>
        {copyable && value && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(value);
              toast.success('Copied to clipboard');
            }}
            className={clsx('p-1 rounded hover:bg-opacity-50', themeClasses.bg.tertiary)}
          >
            <Copy size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const { data: asset, isLoading, isError } = useQuery<Asset>({
    queryKey: ['assets', id],
    queryFn: async () => {
      const response = await api.get(`/api/v1/assets/${id}`);
      return response.data.data;
    },
  });

  if (isLoading) {
    return (
      <div className={clsx('min-h-screen p-6', themeClasses.bg.primary, 'flex items-center justify-center')}>
        <p className={themeClasses.text.secondary}>Loading asset details...</p>
      </div>
    );
  }

  if (isError || !asset) {
    return (
      <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/assets')}
            className={clsx('flex items-center gap-2 mb-6', themeClasses.text.primary, 'hover:opacity-70')}
          >
            <ArrowLeft size={20} />
            Back to Assets
          </button>
          <div className={clsx('rounded-lg p-8 text-center', themeClasses.bg.card)}>
            <p className={clsx('text-lg font-medium', themeClasses.text.primary)}>Asset not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Button */}
        <button
          onClick={() => navigate('/assets')}
          className={clsx('flex items-center gap-2 mb-4', themeClasses.text.primary, 'hover:opacity-70')}
        >
          <ArrowLeft size={20} />
          Back to Assets
        </button>

        {/* Header */}
        <div className={clsx('rounded-lg p-6', themeClasses.bg.card)}>
          <div className="flex justify-between items-start gap-4 mb-4">
            <div>
              <h1 className={clsx('text-3xl font-bold mb-2', themeClasses.text.primary)}>
                {asset.hostname}
              </h1>
              <p className={clsx('text-sm', themeClasses.text.secondary)}>{asset.asset_id}</p>
            </div>
            <div className="flex gap-2">
              <span className={clsx('px-3 py-1 rounded-full text-xs font-medium', 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200')}>
                {asset.asset_type}
              </span>
              <span className={clsx('px-3 py-1 rounded-full text-xs font-medium', asset.status === 'Active' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200')}>
                {asset.status}
              </span>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className={clsx('p-3 rounded', themeClasses.bg.secondary)}>
              <p className={clsx('text-xs', themeClasses.text.secondary)}>Confidence</p>
              <p className={clsx('text-lg font-bold', themeClasses.text.primary)}>{asset.confidence_score}%</p>
            </div>
            <div className={clsx('p-3 rounded', themeClasses.bg.secondary)}>
              <p className={clsx('text-xs', themeClasses.text.secondary)}>Created</p>
              <p className={clsx('text-sm font-medium', themeClasses.text.primary)}>
                {new Date(asset.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className={clsx('p-3 rounded', themeClasses.bg.secondary)}>
              <p className={clsx('text-xs', themeClasses.text.secondary)}>Updated</p>
              <p className={clsx('text-sm font-medium', themeClasses.text.primary)}>
                {new Date(asset.updated_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className={clsx('rounded-lg overflow-hidden', themeClasses.bg.card)}>
          {/* Tab Buttons */}
          <div className={clsx('flex gap-0 border-b', themeClasses.border.primary)}>
            <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
              Overview
            </TabButton>
            <TabButton active={activeTab === 'network'} onClick={() => setActiveTab('network')}>
              Network
            </TabButton>
            <TabButton active={activeTab === 'software'} onClick={() => setActiveTab('software')}>
              Software
            </TabButton>
            <TabButton active={activeTab === 'health'} onClick={() => setActiveTab('health')}>
              Health Checks
            </TabButton>
            <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')}>
              History
            </TabButton>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <InfoRow label="Hostname" value={asset.hostname} copyable />
                <InfoRow label="Display Name" value={asset.display_name} />
                <InfoRow label="Type" value={asset.asset_type} />
                <InfoRow label="Primary IP" value={asset.primary_ip_address} copyable />
                <InfoRow label="Status" value={asset.status} />
                <InfoRow label="Owner" value={asset.owner_name} />
                {asset.tags && asset.tags.length > 0 && (
                  <div className="py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
                    <p className={clsx('text-sm font-medium mb-2', themeClasses.text.secondary)}>Tags</p>
                    <div className="flex flex-wrap gap-2">
                      {asset.tags.map((tag) => (
                        <span key={tag} className={clsx('px-3 py-1 rounded-full text-xs', themeClasses.bg.secondary, themeClasses.text.primary)}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {asset.notes && (
                  <div className="py-3 border-b" style={{ borderColor: 'var(--border-color)' }}>
                    <p className={clsx('text-sm font-medium mb-2', themeClasses.text.secondary)}>Notes</p>
                    <p className={clsx('text-sm', themeClasses.text.primary)}>{asset.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Network Tab */}
            {activeTab === 'network' && (
              <div className="space-y-4">
                {asset.interfaces && asset.interfaces.length > 0 ? (
                  <div>
                    <h3 className={clsx('text-sm font-semibold mb-3', themeClasses.text.primary)}>Network Interfaces</h3>
                    {asset.interfaces.map((iface) => (
                      <div key={iface.id} className={clsx('p-3 rounded mb-2', themeClasses.bg.secondary)}>
                        <p className={clsx('font-medium text-sm', themeClasses.text.primary)}>
                          {iface.interface_name || 'Interface'}
                        </p>
                        <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>
                          IP: <code className={clsx('px-1 rounded', themeClasses.bg.tertiary)}>{iface.ip_address}</code>
                        </p>
                        {iface.mac_address && (
                          <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>
                            MAC: <code className={clsx('px-1 rounded', themeClasses.bg.tertiary)}>{iface.mac_address}</code>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={clsx('text-sm', themeClasses.text.secondary)}>No network interfaces configured</p>
                )}
              </div>
            )}

            {/* Software Tab */}
            {activeTab === 'software' && (
              <div className="space-y-3">
                {asset.software && asset.software.length > 0 ? (
                  <>
                    <p className={clsx('text-sm', themeClasses.text.secondary, 'mb-3')}>
                      {asset.software.length} software package{asset.software.length !== 1 ? 's' : ''} installed
                    </p>
                    {asset.software.map((sw) => (
                      <div key={sw.id} className={clsx('p-3 rounded', themeClasses.bg.secondary)}>
                        <p className={clsx('font-medium text-sm', themeClasses.text.primary)}>{sw.name}</p>
                        {sw.version && (
                          <p className={clsx('text-xs', themeClasses.text.secondary)}>Version: {sw.version}</p>
                        )}
                        {sw.vendor && (
                          <p className={clsx('text-xs', themeClasses.text.secondary)}>Vendor: {sw.vendor}</p>
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <p className={clsx('text-sm', themeClasses.text.secondary)}>No software information available</p>
                )}
              </div>
            )}

            {/* Health Checks Tab */}
            {activeTab === 'health' && (
              <div className="space-y-3">
                {asset.health_checks && asset.health_checks.length > 0 ? (
                  <>
                    <p className={clsx('text-sm', themeClasses.text.secondary, 'mb-3')}>
                      {asset.health_checks.length} health check{asset.health_checks.length !== 1 ? 's' : ''}
                    </p>
                    {asset.health_checks.map((check) => (
                      <div key={check.id} className={clsx('p-3 rounded', themeClasses.bg.secondary)}>
                        <div className="flex justify-between items-center">
                          <p className={clsx('font-medium text-sm', themeClasses.text.primary)}>{check.check_type}</p>
                          <span className={clsx('px-2 py-1 rounded text-xs font-medium', check.status === 'Online' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200')}>
                            {check.status}
                          </span>
                        </div>
                        {check.response_time_ms && (
                          <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>
                            Response: {check.response_time_ms}ms
                          </p>
                        )}
                        <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>
                          Last checked: {new Date(check.last_checked).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className={clsx('text-sm', themeClasses.text.secondary)}>No health checks available</p>
                )}
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div className="space-y-3">
                {asset.audit_log && asset.audit_log.length > 0 ? (
                  <>
                    <p className={clsx('text-sm', themeClasses.text.secondary, 'mb-3')}>
                      {asset.audit_log.length} change{asset.audit_log.length !== 1 ? 's' : ''}
                    </p>
                    {asset.audit_log.map((entry) => (
                      <div key={entry.id} className={clsx('p-3 rounded border', themeClasses.bg.secondary, themeClasses.border.primary)}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold px-2 py-1 rounded" style={{ backgroundColor: 'rgba(147, 51, 234, 0.2)', color: 'rgb(147, 51, 234)' }}>
                            {entry.action}
                          </span>
                        </div>
                        <p className={clsx('text-xs', themeClasses.text.secondary)}>
                          {new Date(entry.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </>
                ) : (
                  <p className={clsx('text-sm', themeClasses.text.secondary)}>No history available</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
