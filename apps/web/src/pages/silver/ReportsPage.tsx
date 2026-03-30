import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Download, Mail, Trash2, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface ScheduledReport {
  report_id: string;
  name: string;
  report_type: string;
  format: string;
  schedule_cron: string;
  recipient_emails: string[];
  is_active: boolean;
  last_sent_at?: string;
  next_send_at?: string;
  created_at: string;
}

const REPORT_TYPES = [
  { value: 'full_asset_list', label: 'Full Asset List', description: 'All assets with all fields' },
  { value: 'risk_summary', label: 'Risk Summary', description: 'Critical & High risk assets' },
  { value: 'connector_health', label: 'Connector Health', description: 'Sync status and failure rates' },
  { value: 'discovery', label: 'Discovery Report', description: 'Recently discovered assets' },
];

const CRON_PRESETS = [
  { label: 'Daily at 9am', value: '0 9 * * *' },
  { label: 'Weekly (Mon 9am)', value: '0 9 * * 1' },
  { label: 'Monthly (1st, 9am)', value: '0 9 1 * *' },
  { label: 'Custom', value: 'custom' },
];

function ReportCard({ report, onDelete, onSendNow }: {
  report: ScheduledReport;
  onDelete: (id: string) => void;
  onSendNow: (report: ScheduledReport) => void;
}) {
  const typeLabel = REPORT_TYPES.find((t) => t.value === report.report_type)?.label ?? report.report_type;

  return (
    <div className={clsx('rounded-xl border p-4 space-y-3', themeClasses.bg.card, themeClasses.border.primary)}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className={clsx('font-semibold', themeClasses.text.primary)}>{report.name}</h3>
          <p className={clsx('text-xs mt-0.5', themeClasses.text.secondary)}>{typeLabel} · {report.format.toUpperCase()}</p>
        </div>
        <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium',
          report.is_active ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300')}>
          {report.is_active ? 'Active' : 'Paused'}
        </span>
      </div>

      <div className={clsx('text-xs space-y-1', themeClasses.text.secondary)}>
        <p>Schedule: <span className="font-mono">{report.schedule_cron}</span></p>
        <p>Recipients: {report.recipient_emails.join(', ')}</p>
        {report.last_sent_at && <p>Last sent: {new Date(report.last_sent_at).toLocaleString()}</p>}
        {report.next_send_at && <p>Next: {new Date(report.next_send_at).toLocaleString()}</p>}
      </div>

      <div className="flex gap-2">
        <button onClick={() => onSendNow(report)}
          className={clsx('flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded text-xs font-medium', themeClasses.button.secondary)}>
          <Download size={12} /> Download Now
        </button>
        <button onClick={() => onSendNow({ ...report, recipient_emails: report.recipient_emails })}
          className={clsx('flex items-center gap-1.5 px-3 py-2 rounded text-xs', 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200')}>
          <Mail size={12} /> Send Email
        </button>
        <button onClick={() => { if (window.confirm('Delete this report schedule?')) onDelete(report.report_id); }}
          className="px-3 py-2 rounded bg-red-50 dark:bg-red-900/30">
          <Trash2 size={12} className="text-red-500" />
        </button>
      </div>
    </div>
  );
}

function CreateReportModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '',
    report_type: 'full_asset_list',
    format: 'csv',
    schedule_cron: '0 9 * * 1',
    cronPreset: '0 9 * * 1',
    recipient_emails: '',
  });

  const mutation = useMutation({
    mutationFn: () => api.post('/api/v1/reports/scheduled', {
      name: form.name,
      report_type: form.report_type,
      format: form.format,
      schedule_cron: form.schedule_cron,
      recipient_emails: form.recipient_emails.split(',').map((e) => e.trim()).filter(Boolean),
    }),
    onSuccess: () => { toast.success('Scheduled report created'); onCreated(); onClose(); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create report'),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={clsx('rounded-xl shadow-xl w-full max-w-lg', themeClasses.bg.card)}>
        <div className={clsx('px-6 py-4 border-b flex justify-between', themeClasses.border.primary)}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>New Scheduled Report</h2>
          <button onClick={onClose} className={clsx('text-xl', themeClasses.text.secondary)}>✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Report Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Weekly Risk Summary"
              className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Report Type</label>
              <select value={form.report_type} onChange={(e) => setForm({ ...form, report_type: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                {REPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>
                {REPORT_TYPES.find((t) => t.value === form.report_type)?.description}
              </p>
            </div>
            <div>
              <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Format</label>
              <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}>
                <option value="csv">CSV</option>
                <option value="excel">Excel</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
          </div>

          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Schedule</label>
            <div className="grid grid-cols-2 gap-2">
              {CRON_PRESETS.map((p) => (
                <button key={p.value} onClick={() => setForm({ ...form, cronPreset: p.value, schedule_cron: p.value !== 'custom' ? p.value : form.schedule_cron })}
                  className={clsx('px-3 py-2 rounded border text-xs text-left',
                    form.cronPreset === p.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200'
                      : clsx(themeClasses.border.primary, themeClasses.text.secondary))}>
                  {p.label}
                </button>
              ))}
            </div>
            {form.cronPreset === 'custom' && (
              <input value={form.schedule_cron} onChange={(e) => setForm({ ...form, schedule_cron: e.target.value })}
                placeholder="cron expression e.g. 0 9 * * 1"
                className={clsx('mt-2 w-full px-3 py-2 rounded border text-sm font-mono', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
            )}
          </div>

          <div>
            <label className={clsx('block text-sm font-medium mb-1', themeClasses.text.primary)}>Recipient Emails</label>
            <input value={form.recipient_emails} onChange={(e) => setForm({ ...form, recipient_emails: e.target.value })}
              placeholder="admin@company.com, security@company.com"
              className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)} />
            <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>Comma-separated. Requires SMTP configured in environment.</p>
          </div>
        </div>

        <div className={clsx('px-6 py-4 border-t flex gap-3 justify-end', themeClasses.border.primary)}>
          <button onClick={onClose} className={clsx('px-4 py-2 rounded text-sm', themeClasses.button.secondary)}>Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending}
            className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}>
            {mutation.isPending ? 'Creating…' : 'Create Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReportsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['scheduled-reports'],
    queryFn: () => api.get('/api/v1/reports/scheduled').then((r) => r.data.data || []),
  });
  const reports: ScheduledReport[] = data || [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/reports/scheduled/${id}`),
    onSuccess: () => { toast.success('Report deleted'); queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] }); },
  });

  const sendNow = async (report: ScheduledReport) => {
    try {
      const resp = await api.post('/api/v1/reports/send-now', {
        report_type: report.report_type,
        format: report.format,
        recipient_emails: report.recipient_emails,
      }, { responseType: 'blob' });

      const url = URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.report_type}-${new Date().toISOString().split('T')[0]}.${report.format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch (err: any) {
      toast.error('Failed to generate report');
    }
  };

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-6xl mx-auto space-y-6">
        <button onClick={() => navigate('/assets')} className={clsx('flex items-center gap-2', themeClasses.text.primary, 'hover:opacity-70')}>
          <ArrowLeft size={20} /> Back to Assets
        </button>

        <div className="flex justify-between items-start">
          <div>
            <h1 className={clsx('text-3xl font-bold mb-1', themeClasses.text.primary)}>Reports</h1>
            <p className={clsx('text-sm', themeClasses.text.secondary)}>Schedule and deliver asset reports via email</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-white', themeClasses.button.primary)}>
            <Plus size={18} /> New Report
          </button>
        </div>

        {/* Quick download row */}
        <div className={clsx('rounded-xl border p-4', themeClasses.bg.card, themeClasses.border.primary)}>
          <p className={clsx('text-sm font-medium mb-3', themeClasses.text.primary)}>Quick Download</p>
          <div className="flex gap-3 flex-wrap">
            {REPORT_TYPES.map((t) => (
              <button key={t.value}
                onClick={() => sendNow({ report_type: t.value, format: 'csv', name: t.label } as ScheduledReport)}
                className={clsx('flex items-center gap-1.5 px-3 py-2 rounded text-sm', themeClasses.button.secondary)}>
                <Download size={13} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scheduled reports */}
        <div>
          <h2 className={clsx('text-lg font-semibold mb-4', themeClasses.text.primary)}>Scheduled Reports</h2>
          {isLoading ? (
            <p className={clsx('text-sm', themeClasses.text.secondary)}>Loading…</p>
          ) : reports.length === 0 ? (
            <div className={clsx('rounded-xl p-12 text-center border border-dashed', themeClasses.border.primary)}>
              <Mail size={32} className={clsx('mx-auto mb-3 opacity-30', themeClasses.text.secondary)} />
              <p className={clsx('text-sm', themeClasses.text.secondary)}>No scheduled reports yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reports.map((r) => (
                <ReportCard key={r.report_id} report={r}
                  onDelete={(id) => deleteMutation.mutate(id)}
                  onSendNow={sendNow} />
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateReportModal
          onClose={() => setShowCreate(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] })}
        />
      )}
    </div>
  );
}
