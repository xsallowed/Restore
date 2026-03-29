import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Edit2, Trash2, AlertCircle, Shield, User, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface UserIdentity {
  asset_id: string;
  display_name: string;
  username: string;
  email: string;
  user_type: string;
  account_status: string;
  mfa_enabled: boolean;
  privileged_access: boolean;
  dormant: boolean;
  orphaned: boolean;
  risk_level: string;
  department?: string;
  manager_email?: string;
  last_login_date?: string;
  password_last_set?: string;
  account_expires?: string;
  group_memberships: string[];
  created_at: string;
  updated_at: string;
}

interface PaginatedResponse {
  success: boolean;
  data: UserIdentity[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

const USER_TYPES = ['Employee', 'Contractor', 'Service Account', 'Shared Account', 'Bot / Automation', 'External User'];
const ACCOUNT_STATUSES = ['Active', 'Disabled', 'Locked', 'Suspended', 'Pending', 'Deleted'];
const IDENTITY_PROVIDERS = ['Active Directory', 'Azure AD', 'Okta', 'Google Workspace', 'JumpCloud', 'Local', 'Other'];

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
          'absolute bottom-full left-0 mb-2 hidden group-hover:block p-2 rounded text-xs whitespace-nowrap z-50',
          'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
        )}>
          {tooltip}
        </div>
      )}
    </div>
  );
}

function UserRow({
  user,
  onEdit,
  onDelete,
}: {
  user: UserIdentity;
  onEdit: (user: UserIdentity) => void;
  onDelete: (id: string) => void;
}) {
  const lastLogin = user.last_login_date ? new Date(user.last_login_date) : null;
  const daysSinceLogin = lastLogin
    ? Math.floor((new Date().getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <tr className={clsx('border-b', themeClasses.border.primary, 'hover:bg-opacity-50', themeClasses.bg.secondary)}>
      <td className={clsx('px-4 py-3 text-sm font-medium', themeClasses.text.primary)}>
        <div>
          <p>{user.display_name}</p>
          <p className={clsx('text-xs', themeClasses.text.secondary)}>{user.username}</p>
        </div>
      </td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{user.email}</td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{user.user_type}</td>

      <td className={clsx('px-4 py-3 text-sm')}>
        <div className="flex items-center gap-2">
          {user.mfa_enabled ? (
            <span className={clsx('px-2 py-1 rounded text-xs', 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200')}>
              ✓ MFA
            </span>
          ) : (
            <span className={clsx('px-2 py-1 rounded text-xs', 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200')}>
              No MFA
            </span>
          )}
        </div>
      </td>

      <td className={clsx('px-4 py-3 text-sm')}>
        {lastLogin ? (
          <span className={clsx(daysSinceLogin && daysSinceLogin > 90 ? 'text-red-600 dark:text-red-400' : themeClasses.text.secondary)}>
            {daysSinceLogin} days ago
          </span>
        ) : (
          <span className={clsx('text-xs', themeClasses.text.secondary)}>Never</span>
        )}
      </td>

      <td className={clsx('px-4 py-3 text-sm')}>
        {user.privileged_access ? (
          <span className={clsx('px-2 py-1 rounded text-xs flex items-center gap-1 w-fit', 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200')}>
            <Lock size={12} /> Admin
          </span>
        ) : (
          <span className={clsx('text-xs', themeClasses.text.secondary)}>User</span>
        )}
      </td>

      <td className={clsx('px-4 py-3 text-sm')}>
        {user.dormant && (
          <span className={clsx('px-2 py-1 rounded text-xs', 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200')}>
            Dormant
          </span>
        )}
        {user.orphaned && (
          <span className={clsx('px-2 py-1 rounded text-xs', 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200')}>
            Orphaned
          </span>
        )}
      </td>

      <td className={clsx('px-4 py-3 text-sm')}>
        <RiskBadge level={user.risk_level} />
      </td>

      <td className={clsx('px-4 py-3 text-sm')}>
        <span className={clsx(
          'px-3 py-1 rounded-full text-xs font-medium',
          user.account_status === 'Active'
            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
        )}>
          {user.account_status}
        </span>
      </td>

      <td className={clsx('px-4 py-3 text-sm', 'flex gap-2')}>
        <button
          onClick={() => onEdit(user)}
          className={clsx('p-2 rounded hover:bg-opacity-50', themeClasses.bg.tertiary)}
          title="Edit"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Delete user account "${user.display_name}"?`)) {
              onDelete(user.asset_id);
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

function CreateEditModal({ user, onClose, onSave }: { user?: UserIdentity; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState({
    display_name: user?.display_name || '',
    username: user?.username || '',
    email: user?.email || '',
    user_type: user?.user_type || 'Employee',
    department: user?.department || '',
    manager_email: user?.manager_email || '',
    account_status: user?.account_status || 'Active',
    mfa_enabled: user?.mfa_enabled || false,
    privileged_access: user?.privileged_access || false,
    account_expires: user?.account_expires?.split('T')[0] || '',
    notes: user?.notes || '',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (user) {
        await api.put(`/api/v1/users/${user.asset_id}`, form);
      } else {
        await api.post('/api/v1/users', form);
      }
    },
    onSuccess: () => {
      toast.success(user ? 'User updated' : 'User created');
      onSave();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to save user');
    },
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-lg shadow-xl w-full max-w-2xl max-h-96 overflow-y-auto', themeClasses.bg.card)}>
        {/* Header */}
        <div className={clsx('px-6 py-4 border-b', themeClasses.border.primary, 'flex justify-between items-center sticky top-0', themeClasses.bg.card)}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>
            {user ? 'Edit User Identity' : 'Create User Identity'}
          </h2>
          <button onClick={onClose} className={clsx('text-2xl', themeClasses.text.secondary)}>
            ✕
          </button>
        </div>

        <div className={clsx('px-6 py-6 space-y-4')}>
          {/* Name & Username */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Display Name *</label>
              <input
                type="text"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                placeholder="e.g., John Doe"
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Username *</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="e.g., john.doe"
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
          </div>

          {/* Email & User Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="john@company.com"
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>User Type *</label>
              <select
                value={form.user_type}
                onChange={(e) => setForm({ ...form, user_type: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                {USER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Department & Manager */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Department</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                placeholder="e.g., Engineering"
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Manager Email</label>
              <input
                type="email"
                value={form.manager_email}
                onChange={(e) => setForm({ ...form, manager_email: e.target.value })}
                placeholder="manager@company.com"
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
          </div>

          {/* Status & Account Expiry */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Account Status</label>
              <select
                value={form.account_status}
                onChange={(e) => setForm({ ...form, account_status: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                {ACCOUNT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Account Expires</label>
              <input
                type="date"
                value={form.account_expires}
                onChange={(e) => setForm({ ...form, account_expires: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.mfa_enabled}
                onChange={(e) => setForm({ ...form, mfa_enabled: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <span className={clsx('text-sm', themeClasses.text.primary)}>MFA Enabled</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.privileged_access}
                onChange={(e) => setForm({ ...form, privileged_access: e.target.checked })}
                className="w-4 h-4 rounded"
              />
              <span className={clsx('text-sm', themeClasses.text.primary)}>Has Privileged Access</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className={clsx('px-6 py-4 border-t', themeClasses.border.primary, 'flex gap-3 justify-end sticky bottom-0', themeClasses.bg.card)}>
          <button onClick={onClose} className={clsx('px-4 py-2 rounded text-sm font-medium', themeClasses.button.secondary)}>
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.display_name || !form.email || mutation.isPending}
            className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}
          >
            {mutation.isPending ? 'Saving...' : 'Save User'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UserIdentitiesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserIdentity | undefined>();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: response, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['users', page, search, typeFilter, riskFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        ...(search && { search }),
        ...(typeFilter && { user_type: typeFilter }),
        ...(riskFilter && { risk_level: riskFilter }),
      });
      const res = await api.get(`/api/v1/users?${params}`);
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/users/${id}`),
    onSuccess: () => {
      toast.success('User deleted');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete'),
  });

  const users = response?.data || [];
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
            <h1 className={clsx('text-3xl font-bold mb-1', themeClasses.text.primary)}>User Identities & Access</h1>
            <p className={clsx('text-sm', themeClasses.text.secondary)}>Manage user accounts, access entitlements, and privileges</p>
          </div>
          <button
            onClick={() => {
              setEditingUser(undefined);
              setShowModal(true);
            }}
            className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}
          >
            <Plus size={20} />
            Add User
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
              placeholder="Search by name or email..."
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
              <option value="">All User Types</option>
              {USER_TYPES.map((t) => (
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
          <div className={clsx('text-center p-12', themeClasses.text.secondary)}>Loading users...</div>
        ) : users.length === 0 ? (
          <div className={clsx('rounded-lg p-12 text-center', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
            <User size={48} className={clsx('mx-auto mb-4', themeClasses.text.secondary)} />
            <p className={clsx('text-lg font-medium mb-2', themeClasses.text.primary)}>No users yet</p>
            <p className={clsx('text-sm mb-6', themeClasses.text.secondary)}>Create your first user identity to track accounts, access entitlements, and detect risks.</p>
            <button
              onClick={() => {
                setEditingUser(undefined);
                setShowModal(true);
              }}
              className={clsx('inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}
            >
              <Plus size={20} />
              Create User
            </button>
          </div>
        ) : (
          <div className={clsx('rounded-lg border overflow-x-auto', themeClasses.bg.card, themeClasses.border.primary)}>
            <table className="w-full">
              <thead className={clsx('border-b', themeClasses.border.primary, themeClasses.bg.secondary)}>
                <tr>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Name</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Email</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Type</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>MFA</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Last Login</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Access</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Flags</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Risk</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Status</th>
                  <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <UserRow
                    key={user.asset_id}
                    user={user}
                    onEdit={(u) => {
                      setEditingUser(u);
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

      {showModal && <CreateEditModal user={editingUser} onClose={() => setShowModal(false)} onSave={() => queryClient.invalidateQueries({ queryKey: ['users'] })} />}
    </div>
  );
}
