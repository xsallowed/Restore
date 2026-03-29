import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Edit2, Trash2, AlertCircle, Bell, CheckCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface AlertRule {
  rule_id: string;
  trigger_type: string;
  asset_type: string;
  condition: string;
  threshold?: number;
  recipient_email: string;
  is_enabled: boolean;
  notification_frequency: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface AlertEvent {
  event_id: string;
  rule_id: string;
  rule_name: string;
  asset_id: string;
  asset_name: string;
  trigger_type: string;
  severity: string;
  message: string;
  is_resolved: boolean;
  created_at: string;
  resolved_at?: string;
}

interface PaginatedRulesResponse {
  success: boolean;
  data: AlertRule[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

interface PaginatedEventsResponse {
  success: boolean;
  data: AlertEvent[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

const TRIGGER_TYPES = [
  'API_KEY_EXPIRY',
  'API_KEY_ROTATION_OVERDUE',
  'USER_ACCOUNT_ORPHANED',
  'USER_ACCOUNT_DORMANT',
  'USER_PRIVILEGED_ACCESS_ADDED',
  'USER_MFA_DISABLED',
  'CONNECTION_UNENCRYPTED',
  'CONNECTION_UNMONITORED',
  'CONNECTION_UNAUTHORIZED',
  'API_KEY_EXPOSED_IN_CODE',
  'CERTIFICATE_EXPIRY_CRITICAL',
  'CERTIFICATE_REVOKED',
  'RISK_LEVEL_CRITICAL',
  'ASSET_NO_OWNERSHIP',
];

const ASSET_TYPES = [
  'API_KEY',
  'USER_IDENTITY',
  'EXTERNAL_CONNECTION',
  'ALL',
];

const NOTIFICATION_FREQUENCIES = [
  'Immediately',
  'Daily Digest',
  'Weekly Summary',
  'Monthly Report',
];

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    'Critical': 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
    'High': 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200',
    'Medium': 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
    'Low': 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
  };

  return (
    <span className={clsx('px-3 py-1 rounded-full text-xs font-semibold', colors[severity] || colors['Low'])}>
      {severity}
    </span>
  );
}

function AlertRuleRow({
  rule,
  onEdit,
  onDelete,
}: {
  rule: AlertRule;
  onEdit: (rule: AlertRule) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr className={clsx('border-b', themeClasses.border.primary, 'hover:bg-opacity-50', themeClasses.bg.secondary)}>
      <td className={clsx('px-4 py-3 text-sm font-medium', themeClasses.text.primary)}>
        {rule.trigger_type.replace(/_/g, ' ')}
      </td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{rule.asset_type}</td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{rule.condition}</td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{rule.recipient_email}</td>
      <td className={clsx('px-4 py-3 text-sm')}>
        <span className={clsx(
          'px-3 py-1 rounded-full text-xs font-medium',
          rule.is_enabled
            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
        )}>
          {rule.is_enabled ? 'Enabled' : 'Disabled'}
        </span>
      </td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{rule.notification_frequency}</td>

      <td className={clsx('px-4 py-3 text-sm', 'flex gap-2')}>
        <button
          onClick={() => onEdit(rule)}
          className={clsx('p-2 rounded hover:bg-opacity-50', themeClasses.bg.tertiary)}
          title="Edit"
        >
          <Edit2 size={14} />
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Delete alert rule for ${rule.trigger_type}?`)) {
              onDelete(rule.rule_id);
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

function AlertEventRow({ event, onResolve }: { event: AlertEvent; onResolve: (id: string) => void }) {
  return (
    <tr className={clsx('border-b', themeClasses.border.primary, 'hover:bg-opacity-50', themeClasses.bg.secondary)}>
      <td className={clsx('px-4 py-3 text-sm font-medium', themeClasses.text.primary)}>
        {event.asset_name}
      </td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{event.rule_name}</td>
      <td className={clsx('px-4 py-3 text-sm')}>
        <SeverityBadge severity={event.severity} />
      </td>
      <td className={clsx('px-4 py-3 text-sm', themeClasses.text.secondary)}>{event.message}</td>
      <td className={clsx('px-4 py-3 text-sm')}>
        {event.is_resolved ? (
          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
            <CheckCircle size={14} />
            Resolved
          </span>
        ) : (
          <button
            onClick={() => {
              if (window.confirm('Mark as resolved?')) {
                onResolve(event.event_id);
              }
            }}
            className="px-2 py-1 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 hover:opacity-80"
          >
            Resolve
          </button>
        )}
      </td>
      <td className={clsx('px-4 py-3 text-xs', themeClasses.text.secondary)}>
        {new Date(event.created_at).toLocaleDateString()}
      </td>
    </tr>
  );
}

function CreateEditAlertRuleModal({
  rule,
  onClose,
  onSave,
}: {
  rule?: AlertRule;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    trigger_type: rule?.trigger_type || 'API_KEY_EXPIRY',
    asset_type: rule?.asset_type || 'ALL',
    condition: rule?.condition || 'equals',
    threshold: rule?.threshold || 0,
    recipient_email: rule?.recipient_email || '',
    is_enabled: rule?.is_enabled ?? true,
    notification_frequency: rule?.notification_frequency || 'Immediately',
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (rule) {
        await api.put(`/api/v1/alerts/rules/${rule.rule_id}`, form);
      } else {
        await api.post('/api/v1/alerts/rules', form);
      }
    },
    onSuccess: () => {
      toast.success(rule ? 'Alert rule updated' : 'Alert rule created');
      onSave();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to save alert rule');
    },
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-lg shadow-xl w-full max-w-2xl max-h-96 overflow-y-auto', themeClasses.bg.card)}>
        {/* Header */}
        <div className={clsx('px-6 py-4 border-b', themeClasses.border.primary, 'flex justify-between items-center sticky top-0', themeClasses.bg.card)}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>
            {rule ? 'Edit Alert Rule' : 'Create Alert Rule'}
          </h2>
          <button onClick={onClose} className={clsx('text-2xl', themeClasses.text.secondary)}>
            ✕
          </button>
        </div>

        <div className={clsx('px-6 py-6 space-y-4')}>
          {/* Trigger Type & Asset Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Trigger Type *</label>
              <select
                value={form.trigger_type}
                onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                {TRIGGER_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Asset Type *</label>
              <select
                value={form.asset_type}
                onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              >
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Condition & Threshold */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Condition *</label>
              <input
                type="text"
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value })}
                placeholder="e.g., equals, greater_than, less_than"
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Threshold (if applicable)</label>
              <input
                type="number"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: parseInt(e.target.value) })}
                placeholder="e.g., 90 (days)"
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>
          </div>

          {/* Recipient Email */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Recipient Email *</label>
            <input
              type="email"
              value={form.recipient_email}
              onChange={(e) => setForm({ ...form, recipient_email: e.target.value })}
              placeholder="alert@company.com"
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            />
          </div>

          {/* Notification Frequency */}
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Notification Frequency *</label>
            <select
              value={form.notification_frequency}
              onChange={(e) => setForm({ ...form, notification_frequency: e.target.value })}
              className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
            >
              {NOTIFICATION_FREQUENCIES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Enabled */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_enabled}
              onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className={clsx('text-sm', themeClasses.text.primary)}>Enable this alert rule</span>
          </label>
        </div>

        {/* Footer */}
        <div className={clsx('px-6 py-4 border-t', themeClasses.border.primary, 'flex gap-3 justify-end sticky bottom-0', themeClasses.bg.card)}>
          <button onClick={onClose} className={clsx('px-4 py-2 rounded text-sm font-medium', themeClasses.button.secondary)}>
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.recipient_email || mutation.isPending}
            className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}
          >
            {mutation.isPending ? 'Saving...' : 'Save Alert Rule'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AlertEnginePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | undefined>();
  const [activeTab, setActiveTab] = useState<'rules' | 'events'>('rules');
  const [rulesPage, setRulesPage] = useState(1);
  const [eventsPage, setEventsPage] = useState(1);

  // Fetch Alert Rules
  const { data: rulesResponse, isLoading: rulesLoading } = useQuery<PaginatedRulesResponse>({
    queryKey: ['alert-rules', rulesPage],
    queryFn: async () => {
      const res = await api.get(`/api/v1/alerts/rules?page=${rulesPage}&limit=20`);
      return res.data;
    },
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });

  // Fetch Alert Events
  const { data: eventsResponse, isLoading: eventsLoading } = useQuery<PaginatedEventsResponse>({
    queryKey: ['alert-events', eventsPage],
    queryFn: async () => {
      const res = await api.get(`/api/v1/alerts/events?page=${eventsPage}&limit=20&unresolved=true`);
      return res.data;
    },
    retry: (failureCount, error: any) => {
      if (error?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/alerts/rules/${id}`),
    onSuccess: () => {
      toast.success('Alert rule deleted');
      queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete'),
  });

  const resolveEventMutation = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/alerts/events/${id}/resolve`, {}),
    onSuccess: () => {
      toast.success('Alert resolved');
      queryClient.invalidateQueries({ queryKey: ['alert-events'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to resolve'),
  });

  const rules = rulesResponse?.data || [];
  const events = eventsResponse?.data || [];
  const rulesTotalPages = rulesResponse?.total_pages || 1;
  const eventsTotalPages = eventsResponse?.total_pages || 1;

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
            <h1 className={clsx('text-3xl font-bold mb-1', themeClasses.text.primary)}>Alert Engine</h1>
            <p className={clsx('text-sm', themeClasses.text.secondary)}>Configure alerts and monitor events</p>
          </div>
          {activeTab === 'rules' && (
            <button
              onClick={() => {
                setEditingRule(undefined);
                setShowRuleModal(true);
              }}
              className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}
            >
              <Plus size={20} />
              New Alert Rule
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className={clsx('rounded-lg border-b', themeClasses.border.primary, themeClasses.bg.card, 'flex gap-0')}>
          <button
            onClick={() => setActiveTab('rules')}
            className={clsx(
              'px-6 py-3 font-medium border-b-2 transition',
              activeTab === 'rules'
                ? clsx('text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400')
                : clsx(themeClasses.text.secondary, 'border-transparent')
            )}
          >
            <div className="flex items-center gap-2">
              <Bell size={18} />
              Alert Rules
            </div>
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={clsx(
              'px-6 py-3 font-medium border-b-2 transition',
              activeTab === 'events'
                ? clsx('text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400')
                : clsx(themeClasses.text.secondary, 'border-transparent')
            )}
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={18} />
              Alert Events
            </div>
          </button>
        </div>

        {/* Rules Tab */}
        {activeTab === 'rules' && (
          <div className="space-y-6">
            {rulesLoading ? (
              <div className={clsx('text-center p-12', themeClasses.text.secondary)}>Loading alert rules...</div>
            ) : rules.length === 0 ? (
              <div className={clsx('rounded-lg p-12 text-center', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
                <Bell size={48} className={clsx('mx-auto mb-4', themeClasses.text.secondary)} />
                <p className={clsx('text-lg font-medium mb-2', themeClasses.text.primary)}>No alert rules yet</p>
                <p className={clsx('text-sm mb-6', themeClasses.text.secondary)}>Create your first alert rule to start monitoring your assets for critical events.</p>
                <button
                  onClick={() => {
                    setEditingRule(undefined);
                    setShowRuleModal(true);
                  }}
                  className={clsx('inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}
                >
                  <Plus size={20} />
                  Create Alert Rule
                </button>
              </div>
            ) : (
              <div className={clsx('rounded-lg border overflow-x-auto', themeClasses.bg.card, themeClasses.border.primary)}>
                <table className="w-full">
                  <thead className={clsx('border-b', themeClasses.border.primary, themeClasses.bg.secondary)}>
                    <tr>
                      <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Trigger</th>
                      <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Asset Type</th>
                      <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Condition</th>
                      <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Email</th>
                      <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Status</th>
                      <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Frequency</th>
                      <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <AlertRuleRow
                        key={rule.rule_id}
                        rule={rule}
                        onEdit={(r) => {
                          setEditingRule(r);
                          setShowRuleModal(true);
                        }}
                        onDelete={(id) => deleteRuleMutation.mutate(id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {rulesTotalPages > 1 && (
              <div className="flex justify-between items-center">
                <p className={clsx('text-sm', themeClasses.text.secondary)}>
                  Page {rulesPage} of {rulesTotalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRulesPage(Math.max(1, rulesPage - 1))}
                    disabled={rulesPage === 1}
                    className={clsx('px-3 py-2 rounded text-sm font-medium', themeClasses.button.secondary, 'disabled:opacity-50')}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setRulesPage(Math.min(rulesTotalPages, rulesPage + 1))}
                    disabled={rulesPage === rulesTotalPages}
                    className={clsx('px-3 py-2 rounded text-sm font-medium', themeClasses.button.secondary, 'disabled:opacity-50')}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Events Tab */}
        {activeTab === 'events' && (
          <div className="space-y-6">
            {eventsLoading ? (
              <div className={clsx('text-center p-12', themeClasses.text.secondary)}>Loading alert events...</div>
            ) : events.length === 0 ? (
              <div className={clsx('rounded-lg p-12 text-center', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
                <CheckCircle size={48} className={clsx('mx-auto mb-4 text-green-600')} />
                <p className={clsx('text-lg font-medium mb-2', themeClasses.text.primary)}>All alerts resolved</p>
                <p className={clsx('text-sm', themeClasses.text.secondary)}>There are no unresolved alerts at this time.</p>
              </div>
            ) : (
              <div className={clsx('rounded-lg border overflow-x-auto', themeClasses.bg.card, themeClasses.border.primary)}>
                <table className="w-full">
                  <thead className={clsx('border-b', themeClasses.border.primary, themeClasses.bg.secondary)}>
                    <tr>
                      <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Asset</th>
                      <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Rule</th>
                      <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Severity</th>
                      <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Message</th>
                      <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Status</th>
                      <th className={clsx('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider', themeClasses.text.secondary)}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <AlertEventRow
                        key={event.event_id}
                        event={event}
                        onResolve={(id) => resolveEventMutation.mutate(id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {eventsTotalPages > 1 && (
              <div className="flex justify-between items-center">
                <p className={clsx('text-sm', themeClasses.text.secondary)}>
                  Page {eventsPage} of {eventsTotalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEventsPage(Math.max(1, eventsPage - 1))}
                    disabled={eventsPage === 1}
                    className={clsx('px-3 py-2 rounded text-sm font-medium', themeClasses.button.secondary, 'disabled:opacity-50')}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setEventsPage(Math.min(eventsTotalPages, eventsPage + 1))}
                    disabled={eventsPage === eventsTotalPages}
                    className={clsx('px-3 py-2 rounded text-sm font-medium', themeClasses.button.secondary, 'disabled:opacity-50')}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showRuleModal && (
        <CreateEditAlertRuleModal
          key={editingRule?.rule_id}
          rule={editingRule}
          onClose={() => setShowRuleModal(false)}
          onSave={() => queryClient.invalidateQueries({ queryKey: ['alert-rules'] })}
        />
      )}
    </div>
  );
}
