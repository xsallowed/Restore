import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { AlertTriangle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface EscalationModalProps {
  eventId: string;
  stepId?: string;
  stepName?: string;
  onClose: () => void;
  onEscalated?: () => void;
}

const SEVERITIES = [
  { value: 'LOW',      label: 'Low',      color: 'border-gray-300 bg-gray-50 text-gray-700',   desc: 'Minor blocker — can proceed with workaround' },
  { value: 'MEDIUM',   label: 'Medium',   color: 'border-yellow-300 bg-yellow-50 text-yellow-800', desc: 'Significant blocker — needs IC awareness' },
  { value: 'HIGH',     label: 'High',     color: 'border-orange-300 bg-orange-50 text-orange-800', desc: 'Critical blocker — immediate IC action needed' },
  { value: 'CRITICAL', label: 'Critical', color: 'border-red-300 bg-red-50 text-red-800',         desc: 'Recovery at risk — escalate now' },
];

export function EscalationModal({ eventId, stepId, stepName, onClose, onEscalated }: EscalationModalProps) {
  const [severity, setSeverity] = useState('HIGH');
  const [description, setDescription] = useState('');

  const escalateMutation = useMutation({
    mutationFn: () => api.post(`/events/${eventId}/escalations`, {
      stepId: stepId || null,
      severity,
      description,
    }),
    onSuccess: () => {
      toast.success('Escalation raised — Incident Commander has been notified');
      onEscalated?.();
      onClose();
    },
    onError: () => toast.error('Failed to raise escalation'),
  });

  return (
    <div style={{ minHeight: 420, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      className="inset-0 z-50"
      onClick={onClose}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" />
            <h2 className="font-semibold text-gray-900">Raise Escalation</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Step context */}
          {stepName && (
            <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-sm text-gray-700">
              <span className="text-gray-400 text-xs">Step: </span>{stepName}
            </div>
          )}

          {/* Severity */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Severity</label>
            <div className="space-y-2">
              {SEVERITIES.map(s => (
                <label key={s.value} className={clsx(
                  'flex items-start gap-3 border-2 rounded-lg px-3 py-2.5 cursor-pointer transition-all',
                  severity === s.value ? s.color + ' border-opacity-100' : 'border-gray-100 hover:border-gray-200'
                )}>
                  <input
                    type="radio" name="severity" value={s.value}
                    checked={severity === s.value}
                    onChange={() => setSeverity(s.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs opacity-70">{s.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the blocker, what you've tried, and what you need from the Incident Commander…"
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 text-sm font-medium text-gray-600 border border-gray-200 py-2.5 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => escalateMutation.mutate()}
            disabled={!description.trim() || escalateMutation.isPending}
            className="flex-1 text-sm font-medium bg-red-600 text-white py-2.5 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {escalateMutation.isPending ? 'Raising…' : 'Raise Escalation'}
          </button>
        </div>
      </div>
    </div>
  );
}
