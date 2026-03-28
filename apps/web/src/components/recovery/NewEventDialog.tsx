import { useState } from 'react';
import { X, FileUp, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

interface NewEventDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (event: {
    title: string;
    event_type: string;
    severity: 'P1' | 'P2' | 'P3' | 'P4';
    runbooks?: string[];
  }) => void;
}

const EVENT_TYPES = [
  'Ransomware Attack',
  'Data Breach',
  'DDoS Attack',
  'Infrastructure Failure',
  'Database Corruption',
  'Security Incident',
  'Network Outage',
  'Service Degradation',
  'Other',
];

export function NewEventDialog({ isOpen, onClose, onCreate }: NewEventDialogProps) {
  const [form, setForm] = useState({
    title: '',
    event_type: EVENT_TYPES[0],
    severity: 'P1' as const,
  });
  const [runbooks, setRunbooks] = useState<File[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const pdfs = files.filter(f => f.type === 'application/pdf');
    
    if (pdfs.length !== files.length) {
      toast.error('Only PDF files are supported');
    }
    
    setRunbooks(prev => [...prev, ...pdfs]);
  };

  const handleRemoveRunbook = (index: number) => {
    setRunbooks(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast.error('Event title is required');
      return;
    }

    setIsCreating(true);
    try {
      // Simulate runbook upload
      const runbookNames = runbooks.map(f => f.name);
      
      onCreate({
        title: form.title,
        event_type: form.event_type,
        severity: form.severity,
        runbooks: runbookNames,
      });

      toast.success('Event created successfully');
      setForm({ title: '', event_type: EVENT_TYPES[0], severity: 'P1' });
      setRunbooks([]);
      onClose();
    } catch (err) {
      toast.error('Failed to create event');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200 px-6 py-4 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Create New Incident</h2>
            <p className="text-sm text-gray-600 mt-1">Start a new recovery operation</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Event Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">Incident Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Ransomware Attack on Production Database"
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
            />
          </div>

          {/* Event Type & Severity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Event Type</label>
              <select
                value={form.event_type}
                onChange={(e) => setForm(f => ({ ...f, event_type: e.target.value }))}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              >
                {EVENT_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">Severity</label>
              <select
                value={form.severity}
                onChange={(e) => setForm(f => ({ ...f, severity: e.target.value as 'P1' | 'P2' | 'P3' | 'P4' }))}
                className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              >
                <option value="P1">🔴 Critical (P1)</option>
                <option value="P2">🟠 High (P2)</option>
                <option value="P3">🟡 Medium (P3)</option>
                <option value="P4">⚪ Low (P4)</option>
              </select>
            </div>
          </div>

          {/* Runbook Upload */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">Import Runbooks</label>
              <label className="flex flex-col items-center justify-center w-full border-2 border-dashed border-gray-300 rounded-xl py-8 px-4 hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-all">
                <FileUp size={32} className="text-gray-400 mb-2" />
                <span className="text-sm font-medium text-gray-700">Drag & drop PDFs or click to select</span>
                <span className="text-xs text-gray-500 mt-1">Runbooks will guide recovery steps</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>

            {/* Uploaded Runbooks */}
            {runbooks.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">Imported Runbooks ({runbooks.length})</p>
                {runbooks.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2">
                      <FileUp size={16} className="text-blue-600" />
                      <span className="text-sm text-gray-700">{file.name}</span>
                      <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <button
                      onClick={() => handleRemoveRunbook(idx)}
                      className="text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alert */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
            <AlertTriangle size={20} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">This will trigger the recovery process</p>
              <p className="text-xs text-blue-700 mt-1">All configured teams will be notified and recovery steps will begin execution.</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isCreating}
            className="px-6 py-2 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-xl font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !form.title.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isCreating ? 'Creating...' : 'Create Incident'}
          </button>
        </div>
      </div>
    </div>
  );
}
