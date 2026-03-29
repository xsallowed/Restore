import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, AlertCircle, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface ScanForm {
  name: string;
  description: string;
  scan_type: string;
  target_type: string;
  target_value: string;
  asset_group_id: string;
  port_preset: string;
  custom_ports: string;
  timing: string;
  credentials_type: string;
  credentials_username: string;
  credentials_password: string;
  credentials_domain: string;
  schedule_type: string;
  scheduled_date: string;
  scheduled_time: string;
  schedule_cron: string;
  post_scan_create_assets: boolean;
  post_scan_update_assets: boolean;
  post_scan_flag_unresponsive: boolean;
  post_scan_send_alert: boolean;
  post_scan_add_to_inbox: boolean;
}

const SCAN_TYPES = [
  { value: 'ICMP', label: 'ICMP Ping Sweep', description: 'Fast network discovery using ping' },
  { value: 'TCP', label: 'TCP Port Scan', description: 'Scan for open ports and services' },
  { value: 'FULL_DISCOVERY', label: 'Full Discovery (ICMP + TCP + Banner Grab)', description: 'Comprehensive host discovery' },
  { value: 'NMAP', label: 'Nmap OS & Service Detection', description: 'Advanced OS and service identification' },
  { value: 'SNMP', label: 'SNMP Poll', description: 'Query SNMP-enabled devices' },
  { value: 'HTTP', label: 'HTTP/HTTPS Health Check', description: 'Check web service availability' },
];

const TARGET_TYPES = [
  { value: 'SINGLE_IP', label: 'Single IP', placeholder: '192.168.1.10' },
  { value: 'IP_RANGE', label: 'IP Range', placeholder: '192.168.1.1-254' },
  { value: 'CIDR', label: 'CIDR Subnet', placeholder: '192.168.1.0/24' },
  { value: 'ASSET_GROUP', label: 'Asset Group', placeholder: 'Select a group...' },
  { value: 'ALL_ACTIVE', label: 'All Active Assets', placeholder: 'No input needed' },
];

const PORT_PRESETS = [
  { value: 'top20', label: 'Top 20 common ports', ports: '22,25,53,80,110,143,443,445,1433,1521,3306,3389,5432,5900,6379,8080,8443,9200,27017,5985' },
  { value: 'top100', label: 'Top 100 common ports', ports: '1,3,4,6,7,9,13,17,19,20,21,22,23,24,25,26,30,32,33,37,42,43,49,53,70,79,87,88,89,90,99,100,106,109,110,111,113,119,125,135,139,143,161,179,199,211,212,222,254,255,256,259,264,280,301,306,311,340,366,389,427,443,444,445,458,464,481,497,500,512,513,514,515,524,541,543,544,545,548,554,555,563,587,593,616,617,625,631,636,646,648,666,667,668,683,687,691,700,705,711,714,720,722,726,749,765,777,783,787,800,801,808,843,873,880,888,898,900,903,911,920,921,922,923,924,925,927,931,932,933,934,935,939,940,993,995,999,1000' },
  { value: 'all', label: 'Full 1-65535 (slow - warn user)', ports: '1-65535' },
  { value: 'custom', label: 'Custom', ports: '' },
];

const TIMING_OPTIONS = [
  { value: 'Slow', label: 'Slow (T2)', description: 'Lower impact, stealthy' },
  { value: 'Normal', label: 'Normal (T3)', description: 'Balanced speed and accuracy' },
  { value: 'Fast', label: 'Fast (T4)', description: 'May trigger IDS alerts' },
];

export function ActiveScanPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'config' | 'review' | 'running'>('config');
  const [form, setForm] = useState<ScanForm>({
    name: '',
    description: '',
    scan_type: 'ICMP',
    target_type: 'SINGLE_IP',
    target_value: '',
    asset_group_id: '',
    port_preset: 'top20',
    custom_ports: '',
    timing: 'Normal',
    credentials_type: 'none',
    credentials_username: '',
    credentials_password: '',
    credentials_domain: '',
    schedule_type: 'once',
    scheduled_date: '',
    scheduled_time: '',
    schedule_cron: '',
    post_scan_create_assets: true,
    post_scan_update_assets: true,
    post_scan_flag_unresponsive: true,
    post_scan_send_alert: false,
    post_scan_add_to_inbox: false,
  });

  const [assetGroups, setAssetGroups] = useState<Array<{ id: string; name: string }>>([]);

  const handleInputChange = (field: keyof ScanForm, value: any) => {
    setForm({ ...form, [field]: value });
  };

  const handleSubmit = async () => {
    // Validate required fields
    if (!form.name.trim()) {
      toast.error('Scan name is required');
      return;
    }
    if (!form.target_value.trim() && form.target_type !== 'ALL_ACTIVE') {
      toast.error('Please specify a target');
      return;
    }

    // Build payload
    const payload = {
      name: form.name,
      description: form.description || null,
      scan_type: form.scan_type,
      target_type: form.target_type,
      target_spec: {
        type: form.target_type,
        value: form.target_value || 'all',
        asset_group_id: form.asset_group_id || undefined,
      },
      port_config:
        ['TCP', 'FULL_DISCOVERY', 'NMAP'].includes(form.scan_type)
          ? {
              preset: form.port_preset,
              custom_ports: form.port_preset === 'custom' ? form.custom_ports : undefined,
            }
          : undefined,
      timing: form.timing,
      credentials:
        form.credentials_type !== 'none'
          ? {
              type: form.credentials_type,
              username: form.credentials_username,
              password: form.credentials_password,
              domain: form.credentials_domain || undefined,
            }
          : undefined,
      schedule_type: form.schedule_type,
      scheduled_datetime: form.schedule_type === 'scheduled' ? `${form.scheduled_date}T${form.scheduled_time}` : undefined,
      schedule_cron: form.schedule_type === 'recurring' ? form.schedule_cron : undefined,
      post_scan_actions: {
        create_new_assets: form.post_scan_create_assets,
        update_existing_assets: form.post_scan_update_assets,
        flag_unresponsive: form.post_scan_flag_unresponsive,
        send_alert_new_hosts: form.post_scan_send_alert,
        add_to_discovery_inbox: form.post_scan_add_to_inbox,
      },
    };

    try {
      const response = await api.post('/api/v1/scans', payload);
      toast.success('Scan configuration saved! Starting scan...');
      setStep('running');
      // In a real implementation, navigate to the scan progress/results page
      // For now, just show the review
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create scan');
    }
  };

  const showPortConfig = ['TCP', 'FULL_DISCOVERY', 'NMAP'].includes(form.scan_type);
  const showCredentials = form.scan_type !== 'HTTP';
  const targetType = TARGET_TYPES.find((t) => t.value === form.target_type);
  const selectedScanType = SCAN_TYPES.find((t) => t.value === form.scan_type);

  return (
    <div className={clsx('min-h-screen p-6', themeClasses.bg.primary)}>
      <div className="max-w-4xl mx-auto">
        {/* Header with Back Button */}
        <div className="mb-8">
          <button onClick={() => navigate('/assets')} className={clsx('flex items-center gap-2 mb-4', themeClasses.text.primary, 'hover:opacity-70 transition')}>
            <ArrowLeft size={20} />
            Back to Assets
          </button>
          <h1 className={clsx('text-3xl font-bold mb-2', themeClasses.text.primary)}>New Network Scan</h1>
          <p className={clsx('text-sm', themeClasses.text.secondary)}>Configure and run active scans to discover and verify network assets</p>
        </div>

        {/* Step Indicator */}
        <div className="flex gap-2 mb-8">
          {['config', 'review', 'running'].map((s) => (
            <div
              key={s}
              className={clsx(
                'flex-1 h-2 rounded-full transition',
                step === s ? (themeClasses.bg.primary === 'bg-white' ? 'bg-blue-500' : 'bg-blue-500') : 'bg-gray-300 dark:bg-gray-700'
              )}
            />
          ))}
        </div>

        {/* Configuration View */}
        {step === 'config' && (
          <div className={clsx('rounded-lg p-6 space-y-6', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
            {/* Scan Name */}
            <div>
              <label className={clsx('block text-sm font-medium mb-2', themeClasses.text.primary)}>Scan Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Building A Network Scan"
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>

            {/* Scan Description */}
            <div>
              <label className={clsx('block text-sm font-medium mb-2', themeClasses.text.primary)}>Description (optional)</label>
              <textarea
                value={form.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Add notes about this scan..."
                rows={3}
                className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
              />
            </div>

            {/* Scan Type */}
            <div>
              <label className={clsx('block text-sm font-medium mb-3', themeClasses.text.primary)}>Scan Type *</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {SCAN_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => handleInputChange('scan_type', type.value)}
                    className={clsx(
                      'p-3 rounded-lg border-2 text-left transition',
                      form.scan_type === type.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900'
                        : clsx(themeClasses.border.primary, 'hover:border-blue-300')
                    )}
                  >
                    <p className={clsx('font-medium text-sm', themeClasses.text.primary)}>{type.label}</p>
                    <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>{type.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Target Configuration */}
            <div className={clsx('p-4 rounded-lg', 'bg-blue-50 dark:bg-blue-900')}>
              <h3 className={clsx('font-semibold mb-4', 'text-blue-900 dark:text-blue-100')}>Target Configuration</h3>

              {/* Target Type Selection */}
              <div className="mb-4">
                <label className={clsx('block text-sm font-medium mb-3', themeClasses.text.primary)}>Select Target Type *</label>
                <div className="space-y-2">
                  {TARGET_TYPES.map((type) => (
                    <label key={type.value} className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="target_type"
                        value={type.value}
                        checked={form.target_type === type.value}
                        onChange={(e) => handleInputChange('target_type', e.target.value)}
                        className="w-4 h-4"
                      />
                      <span className={clsx('text-sm', themeClasses.text.primary)}>{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Target Value Input (conditional) */}
              {form.target_type !== 'ALL_ACTIVE' && form.target_type !== 'ASSET_GROUP' && (
                <div className="mb-4">
                  <label className={clsx('block text-sm font-medium mb-2', themeClasses.text.primary)}>Target Value *</label>
                  <input
                    type="text"
                    value={form.target_value}
                    onChange={(e) => handleInputChange('target_value', e.target.value)}
                    placeholder={targetType?.placeholder}
                    className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                  />
                  <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>
                    {form.target_type === 'SINGLE_IP' && 'Enter a single IP address'}
                    {form.target_type === 'IP_RANGE' && 'Enter range like 192.168.1.1-254'}
                    {form.target_type === 'CIDR' && 'Enter CIDR notation like 192.168.1.0/24'}
                  </p>
                </div>
              )}

              {/* Asset Group Selector */}
              {form.target_type === 'ASSET_GROUP' && (
                <div className="mb-4">
                  <label className={clsx('block text-sm font-medium mb-2', themeClasses.text.primary)}>Select Asset Group *</label>
                  <select
                    value={form.asset_group_id}
                    onChange={(e) => handleInputChange('asset_group_id', e.target.value)}
                    className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                  >
                    <option value="">Choose a group...</option>
                    {assetGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* All Active Assets Info */}
              {form.target_type === 'ALL_ACTIVE' && (
                <div className={clsx('p-3 rounded text-sm', 'bg-white dark:bg-gray-800', themeClasses.text.primary)}>
                  This scan will run against all active assets in the registry with a known IP address.
                </div>
              )}
            </div>

            {/* Port Configuration (conditional) */}
            {showPortConfig && (
              <div className={clsx('p-4 rounded-lg border', themeClasses.border.primary)}>
                <h3 className={clsx('font-semibold mb-4', themeClasses.text.primary)}>Port Configuration</h3>

                <div className="mb-4">
                  <label className={clsx('block text-sm font-medium mb-2', themeClasses.text.primary)}>Port Preset</label>
                  <select
                    value={form.port_preset}
                    onChange={(e) => handleInputChange('port_preset', e.target.value)}
                    className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                  >
                    {PORT_PRESETS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </div>

                {form.port_preset === 'custom' && (
                  <div>
                    <label className={clsx('block text-sm font-medium mb-2', themeClasses.text.primary)}>Custom Ports</label>
                    <input
                      type="text"
                      value={form.custom_ports}
                      onChange={(e) => handleInputChange('custom_ports', e.target.value)}
                      placeholder="22,80,443,3389,8080-8090"
                      className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                    />
                    <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>Use comma-separated values or ranges (e.g., 22,80,443,8080-8090)</p>
                  </div>
                )}

                {form.port_preset === 'all' && (
                  <div className={clsx('p-3 rounded flex gap-2', 'bg-yellow-50 dark:bg-yellow-900')}>
                    <AlertCircle size={16} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className={clsx('text-xs', 'text-yellow-800 dark:text-yellow-200')}>Scanning all 65,535 ports will take significantly longer. Only use for thorough audits.</p>
                  </div>
                )}
              </div>
            )}

            {/* Scan Speed / Timing */}
            <div>
              <label className={clsx('block text-sm font-medium mb-3', themeClasses.text.primary)}>Scan Speed / Timing</label>
              <div className="space-y-2">
                {TIMING_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                    <input
                      type="radio"
                      name="timing"
                      value={option.value}
                      checked={form.timing === option.value}
                      onChange={(e) => handleInputChange('timing', e.target.value)}
                      className="w-4 h-4 mt-0.5"
                    />
                    <div className="flex-1">
                      <p className={clsx('text-sm font-medium', themeClasses.text.primary)}>{option.label}</p>
                      <p className={clsx('text-xs', themeClasses.text.secondary)}>{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>
              {form.timing === 'Fast' && (
                <div className={clsx('mt-3 p-3 rounded flex gap-2', 'bg-red-50 dark:bg-red-900')}>
                  <AlertCircle size={16} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                  <p className={clsx('text-xs', 'text-red-800 dark:text-red-200')}>Fast timing may trigger IDS/IPS alerts on your network.</p>
                </div>
              )}
            </div>

            {/* Credentials (optional) */}
            {showCredentials && (
              <div className={clsx('p-4 rounded-lg border', themeClasses.border.primary)}>
                <h3 className={clsx('font-semibold mb-4', themeClasses.text.primary)}>Credentials (Optional)</h3>
                <p className={clsx('text-xs mb-4', themeClasses.text.secondary)}>For authenticated scans using SSH or WMI</p>

                <div className="mb-4">
                  <label className={clsx('block text-sm font-medium mb-2', themeClasses.text.primary)}>Credential Type</label>
                  <select
                    value={form.credentials_type}
                    onChange={(e) => handleInputChange('credentials_type', e.target.value)}
                    className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                  >
                    <option value="none">No credentials</option>
                    <option value="ssh">SSH</option>
                    <option value="wmi">WMI/Windows</option>
                  </select>
                </div>

                {form.credentials_type === 'ssh' && (
                  <div className="space-y-3">
                    <div>
                      <label className={clsx('block text-sm font-medium mb-2', themeClasses.text.primary)}>Username</label>
                      <input
                        type="text"
                        value={form.credentials_username}
                        onChange={(e) => handleInputChange('credentials_username', e.target.value)}
                        placeholder="e.g., root or admin"
                        className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                      />
                    </div>
                    <div>
                      <label className={clsx('block text-sm font-medium mb-2', themeClasses.text.primary)}>Password</label>
                      <input
                        type="password"
                        value={form.credentials_password}
                        onChange={(e) => handleInputChange('credentials_password', e.target.value)}
                        placeholder="••••••••"
                        className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                      />
                    </div>
                  </div>
                )}

                {form.credentials_type === 'wmi' && (
                  <div className="space-y-3">
                    <div>
                      <label className={clsx('block text-sm font-medium mb-2', themeClasses.text.primary)}>Domain\Username</label>
                      <input
                        type="text"
                        value={form.credentials_username}
                        onChange={(e) => handleInputChange('credentials_username', e.target.value)}
                        placeholder="e.g., DOMAIN\Administrator"
                        className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                      />
                    </div>
                    <div>
                      <label className={clsx('block text-sm font-medium mb-2', themeClasses.text.primary)}>Password</label>
                      <input
                        type="password"
                        value={form.credentials_password}
                        onChange={(e) => handleInputChange('credentials_password', e.target.value)}
                        placeholder="••••••••"
                        className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Schedule Configuration */}
            <div className={clsx('p-4 rounded-lg border', themeClasses.border.primary)}>
              <h3 className={clsx('font-semibold mb-4', themeClasses.text.primary)}>Schedule</h3>

              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    value="once"
                    checked={form.schedule_type === 'once'}
                    onChange={(e) => handleInputChange('schedule_type', e.target.value)}
                    className="w-4 h-4"
                  />
                  <span className={clsx('text-sm', themeClasses.text.primary)}>Run once immediately</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    value="scheduled"
                    checked={form.schedule_type === 'scheduled'}
                    onChange={(e) => handleInputChange('schedule_type', e.target.value)}
                    className="w-4 h-4"
                  />
                  <span className={clsx('text-sm', themeClasses.text.primary)}>Schedule for later</span>
                </label>

                {form.schedule_type === 'scheduled' && (
                  <div className="grid grid-cols-2 gap-3 ml-7">
                    <input
                      type="date"
                      value={form.scheduled_date}
                      onChange={(e) => handleInputChange('scheduled_date', e.target.value)}
                      className={clsx('px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                    />
                    <input
                      type="time"
                      value={form.scheduled_time}
                      onChange={(e) => handleInputChange('scheduled_time', e.target.value)}
                      className={clsx('px-3 py-2 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                    />
                  </div>
                )}

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="schedule"
                    value="recurring"
                    checked={form.schedule_type === 'recurring'}
                    onChange={(e) => handleInputChange('schedule_type', e.target.value)}
                    className="w-4 h-4"
                  />
                  <span className={clsx('text-sm', themeClasses.text.primary)}>Recurring schedule</span>
                </label>

                {form.schedule_type === 'recurring' && (
                  <div className="ml-7">
                    <select
                      value={form.schedule_cron}
                      onChange={(e) => handleInputChange('schedule_cron', e.target.value)}
                      className={clsx('w-full px-3 py-2 rounded border', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
                    >
                      <option value="">Select schedule...</option>
                      <option value="0 0 * * *">Daily at midnight</option>
                      <option value="0 0 * * 0">Weekly (Sundays)</option>
                      <option value="0 0 1 * *">Monthly (1st)</option>
                      <option value="0 */12 * * *">Every 12 hours</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Post-Scan Actions */}
            <div className={clsx('p-4 rounded-lg border', themeClasses.border.primary)}>
              <h3 className={clsx('font-semibold mb-4', themeClasses.text.primary)}>Post-Scan Actions</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.post_scan_create_assets}
                    onChange={(e) => handleInputChange('post_scan_create_assets', e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className={clsx('text-sm', themeClasses.text.primary)}>Create new asset records for discovered hosts</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.post_scan_update_assets}
                    onChange={(e) => handleInputChange('post_scan_update_assets', e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className={clsx('text-sm', themeClasses.text.primary)}>Update existing asset records with scan results</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.post_scan_flag_unresponsive}
                    onChange={(e) => handleInputChange('post_scan_flag_unresponsive', e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className={clsx('text-sm', themeClasses.text.primary)}>Flag assets not responding as "Unverified"</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.post_scan_send_alert}
                    onChange={(e) => handleInputChange('post_scan_send_alert', e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className={clsx('text-sm', themeClasses.text.primary)}>Send alert if new unknown hosts are discovered</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.post_scan_add_to_inbox}
                    onChange={(e) => handleInputChange('post_scan_add_to_inbox', e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className={clsx('text-sm', themeClasses.text.primary)}>Add discovered assets to Discovery Inbox for manual review</span>
                </label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <button onClick={() => navigate('/assets')} className={clsx('px-4 py-2 rounded text-sm font-medium', themeClasses.button.secondary)}>
                Cancel
              </button>
              <button
                onClick={() => setStep('review')}
                disabled={!form.name.trim()}
                className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}
              >
                Review & Run
              </button>
            </div>
          </div>
        )}

        {/* Review View */}
        {step === 'review' && (
          <div className={clsx('rounded-lg p-6', themeClasses.bg.card, 'border', themeClasses.border.primary)}>
            <h2 className={clsx('text-xl font-semibold mb-6', themeClasses.text.primary)}>Review Scan Configuration</h2>

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className={clsx('text-xs uppercase tracking-wider mb-1', themeClasses.text.secondary)}>Scan Name</p>
                <p className={clsx('font-semibold', themeClasses.text.primary)}>{form.name}</p>
              </div>
              <div>
                <p className={clsx('text-xs uppercase tracking-wider mb-1', themeClasses.text.secondary)}>Scan Type</p>
                <p className={clsx('font-semibold', themeClasses.text.primary)}>{SCAN_TYPES.find((t) => t.value === form.scan_type)?.label}</p>
              </div>
              <div>
                <p className={clsx('text-xs uppercase tracking-wider mb-1', themeClasses.text.secondary)}>Target</p>
                <p className={clsx('font-semibold', themeClasses.text.primary)}>
                  {form.target_type === 'ALL_ACTIVE' ? 'All Active Assets' : form.target_value}
                </p>
              </div>
              <div>
                <p className={clsx('text-xs uppercase tracking-wider mb-1', themeClasses.text.secondary)}>Timing</p>
                <p className={clsx('font-semibold', themeClasses.text.primary)}>{form.timing}</p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setStep('config')}
                className={clsx('px-4 py-2 rounded text-sm font-medium', themeClasses.button.secondary)}
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary)}
              >
                Start Scan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
