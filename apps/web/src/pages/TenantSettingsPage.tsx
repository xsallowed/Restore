import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Users, Settings, Plus, Trash2, Mail,
  Shield, Crown, Eye, Copy, CheckCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../lib/api';
import { useAuth } from '../store/auth';
import { themeClasses } from '../lib/themeClasses';

const TIER_COLORS: Record<string, string> = {
  BRONZE: 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-200',
  SILVER: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200',
  GOLD:   'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-200',
  AUTHOR: 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200',
  ADMIN:  'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200',
};

function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', TIER_COLORS[tier] ?? TIER_COLORS.BRONZE)}>
      {tier}
    </span>
  );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────

function InviteModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [tier, setTier]   = useState('BRONZE');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.post('/tenant/invitations', { email, tier }),
    onSuccess: (r) => setInviteUrl(r.data.data.invite_url),
    onError: (err: any) => toast.error(err.response?.data?.error || 'Invitation failed'),
  });

  const copy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-xl shadow-xl w-full max-w-md', themeClasses.bg.card)}>
        <div className={clsx('px-6 py-4 border-b flex justify-between', themeClasses.border.primary)}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>Invite User</h2>
          <button onClick={onClose} className={clsx('text-xl', themeClasses.text.secondary)}>x</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!inviteUrl ? (
            <>
              <div>
                <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Email address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  className={clsx('w-full px-3 py-2 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
              </div>
              <div>
                <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Access level</label>
                <select value={tier} onChange={e => setTier(e.target.value)}
                  className={clsx('w-full px-3 py-2 rounded-lg border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                  <option value="BRONZE">Bronze — SOC analyst, step execution</option>
                  <option value="SILVER">Silver — Incident commander, full operations</option>
                  <option value="GOLD">Gold — Executive view only</option>
                  <option value="AUTHOR">Author — Runbook management</option>
                  <option value="ADMIN">Admin — Full access</option>
                </select>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle size={16} />
                <span className="text-sm font-medium">Invitation created</span>
              </div>
              <p className={clsx('text-xs', themeClasses.text.secondary)}>Share this link with {email}:</p>
              <div className="flex gap-2">
                <code className={clsx('flex-1 px-3 py-2 rounded border text-xs font-mono break-all', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                  {inviteUrl}
                </code>
                <button onClick={copy} className={clsx('px-3 py-2 rounded text-sm flex items-center gap-1', themeClasses.button.secondary)}>
                  <Copy size={13} /> {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className={clsx('text-xs', themeClasses.text.secondary)}>Link expires in 7 days.</p>
            </div>
          )}
        </div>

        <div className={clsx('px-6 py-4 border-t flex gap-3 justify-end', themeClasses.border.primary)}>
          <button onClick={onClose} className={clsx('px-4 py-2 rounded text-sm', themeClasses.button.secondary)}>Close</button>
          {!inviteUrl && (
            <button onClick={() => mutation.mutate()} disabled={!email || mutation.isPending}
              className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}>
              {mutation.isPending ? 'Sending...' : 'Send Invitation'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function TenantSettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'settings'>('users');

  const { data: tenantData } = useQuery({
    queryKey: ['tenant'],
    queryFn: () => api.get('/tenant').then(r => r.data.data),
  });

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['tenant-users'],
    queryFn: () => api.get('/tenant/users').then(r => r.data.data || []),
  });

  const members = usersData || [];

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, updates }: { userId: string; updates: any }) =>
      api.patch(`/tenant/users/${userId}`, updates),
    onSuccess: () => { toast.success('User updated'); queryClient.invalidateQueries({ queryKey: ['tenant-users'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Update failed'),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/tenant/users/${userId}`),
    onSuccess: () => { toast.success('User removed'); queryClient.invalidateQueries({ queryKey: ['tenant-users'] }); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  const isAdmin = user?.is_tenant_admin || user?.restore_tier === 'ADMIN';

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-4xl mx-auto space-y-6">
        <button onClick={() => navigate('/')} className={clsx('flex items-center gap-2', themeClasses.text.primary, 'hover:opacity-70')}>
          <ArrowLeft size={20} /> Back
        </button>

        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className={clsx('text-3xl font-bold mb-1', themeClasses.text.primary)}>
              {tenantData?.name ?? 'Organisation'}
            </h1>
            <p className={clsx('text-sm', themeClasses.text.secondary)}>
              <span className="font-mono text-xs">{tenantData?.slug}</span>
              {' · '}
              <span className="capitalize">{tenantData?.plan} plan</span>
              {' · '}
              {tenantData?.user_count ?? 0} / {tenantData?.max_users ?? '?'} users
            </p>
          </div>
          {isAdmin && (
            <button onClick={() => setShowInvite(true)}
              className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}>
              <Plus size={18} /> Invite User
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {[{ id: 'users', label: 'Users', icon: Users }, { id: 'settings', label: 'Settings', icon: Settings }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)}
              className={clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition',
                activeTab === t.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : clsx('border-transparent', themeClasses.text.secondary, 'hover:opacity-80'))}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>

        {/* Users tab */}
        {activeTab === 'users' && (
          <div className={clsx('rounded-xl border overflow-hidden', themeClasses.bg.card, themeClasses.border.primary)}>
            {usersLoading ? (
              <p className={clsx('text-center py-8', themeClasses.text.secondary)}>Loading users...</p>
            ) : (
              <table className="w-full text-sm">
                <thead className={clsx('text-xs uppercase tracking-wide', themeClasses.text.secondary, 'bg-gray-50 dark:bg-gray-800/50')}>
                  <tr>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Tier</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Last login</th>
                    {isAdmin && <th className="px-4 py-3 text-left">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m: any) => (
                    <tr key={m.id} className={clsx('border-t border-gray-100 dark:border-gray-800', themeClasses.text.primary)}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium', 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300')}>
                            {m.display_name[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{m.display_name}</p>
                            <p className={clsx('text-xs', themeClasses.text.secondary)}>{m.email}</p>
                          </div>
                          {m.id === user?.sub && (
                            <span className={clsx('text-xs px-1.5 py-0.5 rounded', themeClasses.bg.secondary, themeClasses.text.secondary)}>You</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3"><TierBadge tier={m.tier} /></td>
                      <td className="px-4 py-3">
                        {m.is_tenant_admin ? (
                          <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                            <Crown size={11} /> Admin
                          </span>
                        ) : (
                          <span className={clsx('text-xs', themeClasses.text.secondary)}>Member</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx('text-xs px-2 py-0.5 rounded-full',
                          m.is_active ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500')}>
                          {m.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className={clsx('px-4 py-3 text-xs', themeClasses.text.secondary)}>
                        {m.last_login_at ? new Date(m.last_login_at).toLocaleDateString() : 'Never'}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          {m.id !== user?.sub && (
                            <div className="flex gap-2">
                              <select
                                defaultValue={m.tier}
                                onChange={e => updateUserMutation.mutate({ userId: m.id, updates: { tier: e.target.value } })}
                                className={clsx('text-xs px-2 py-1 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                                {['BRONZE','SILVER','GOLD','AUTHOR','ADMIN'].map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <button
                                onClick={() => updateUserMutation.mutate({ userId: m.id, updates: { is_active: !m.is_active } })}
                                className={clsx('text-xs px-2 py-1 rounded', themeClasses.button.secondary)}
                                title={m.is_active ? 'Deactivate' : 'Activate'}>
                                {m.is_active ? <Eye size={12} /> : <CheckCircle size={12} />}
                              </button>
                              <button
                                onClick={() => { if (window.confirm(`Remove ${m.display_name}?`)) deleteUserMutation.mutate(m.id); }}
                                className="text-xs px-2 py-1 rounded bg-red-50 dark:bg-red-900/30">
                                <Trash2 size={12} className="text-red-500" />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Settings tab */}
        {activeTab === 'settings' && tenantData && (
          <div className="space-y-4">
            <div className={clsx('rounded-xl border p-6 space-y-4', themeClasses.bg.card, themeClasses.border.primary)}>
              <h3 className={clsx('font-semibold', themeClasses.text.primary)}>Plan Details</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Plan', value: tenantData.plan },
                  { label: 'Slug', value: tenantData.slug },
                  { label: 'Users', value: `${tenantData.user_count} / ${tenantData.max_users}` },
                  { label: 'Assets', value: `${tenantData.asset_count} / ${tenantData.max_assets}` },
                ].map(r => (
                  <div key={r.label} className={clsx('rounded-lg p-3', themeClasses.bg.secondary)}>
                    <p className={clsx('text-xs', themeClasses.text.secondary)}>{r.label}</p>
                    <p className={clsx('font-medium mt-0.5', themeClasses.text.primary)}>{r.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showInvite && <InviteModal onClose={() => { setShowInvite(false); queryClient.invalidateQueries({ queryKey: ['tenant-users'] }); }} />}
    </div>
  );
}
