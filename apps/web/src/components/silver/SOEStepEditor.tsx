import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { eventsApi, api } from '../../lib/api';
import toast from 'react-hot-toast';
import { GripVertical, Plus, Trash2, Edit2, X, Save, ArrowUp, ArrowDown, Bot, User } from 'lucide-react';
import clsx from 'clsx';

interface Step {
  id: string; sequence: number; name: string; description: string;
  step_type: string; swim_lane: string; estimated_duration_minutes: number;
  is_on_critical_path: boolean; status: string; phase_name?: string;
  runbook_citation?: string; requires_approval: boolean;
}

interface StepEditorModalProps {
  eventId: string;
  onClose: () => void;
}

function StepEditForm({ step, onSave, onCancel }: { step: Partial<Step>; onSave: (s: Partial<Step>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ ...step });
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Step name *</label>
          <input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-600 mb-1 block">Description</label>
          <textarea value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Team / swim lane</label>
          <input value={form.swim_lane || ''} onChange={e => setForm(f => ({ ...f, swim_lane: e.target.value }))} placeholder="e.g. Security Team" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Duration (minutes)</label>
          <input type="number" value={form.estimated_duration_minutes || 15} onChange={e => setForm(f => ({ ...f, estimated_duration_minutes: parseInt(e.target.value) || 15 }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Step type</label>
          <select value={form.step_type || 'HUMAN'} onChange={e => setForm(f => ({ ...f, step_type: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400">
            <option value="HUMAN">Human</option>
            <option value="AUTOMATED">Automated</option>
          </select>
        </div>
        <div className="flex items-center gap-4 pt-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_on_critical_path || false} onChange={e => setForm(f => ({ ...f, is_on_critical_path: e.target.checked }))} className="rounded" />
            Critical path
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.requires_approval || false} onChange={e => setForm(f => ({ ...f, requires_approval: e.target.checked }))} className="rounded" />
            Requires approval
          </label>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={() => onSave(form)} disabled={!form.name} className="text-xs bg-brand-600 text-white px-3 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1"><Save size={12} /> Save step</button>
        <button onClick={onCancel} className="text-xs border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}

export function SOEStepEditor({ eventId, onClose }: StepEditorModalProps) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);
  const [deviationNote, setDeviationNote] = useState('');

  const { data: soeData, isLoading } = useQuery({
    queryKey: ['soe', eventId],
    queryFn: () => eventsApi.getSoe(eventId).then(r => r.data.data),
  });

  const steps: Step[] = (soeData?.steps as Step[]) ?? [];
  const soeId = soeData?.id as string | undefined;

  const updateStep = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Step> }) =>
      api.patch(`/soe-steps/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['soe', eventId] }); setEditingId(null); toast.success('Step updated'); },
    onError: () => toast.error('Failed to update step'),
  });

  const addStep = useMutation({
    mutationFn: (data: Partial<Step>) =>
      api.post(`/soes/${soeId}/steps`, { ...data, sequence: steps.length + 1 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['soe', eventId] }); setAddingNew(false); toast.success('Step added'); },
    onError: () => toast.error('Failed to add step'),
  });

  const deleteStep = useMutation({
    mutationFn: (id: string) => api.delete(`/soe-steps/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['soe', eventId] }); toast.success('Step removed'); },
    onError: () => toast.error('Failed to remove step'),
  });

  const moveStep = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) => {
      const idx = steps.findIndex(s => s.id === id);
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= steps.length) return Promise.resolve();
      return Promise.all([
        api.patch(`/soe-steps/${steps[idx].id}`, { sequence: steps[swapIdx].sequence }),
        api.patch(`/soe-steps/${steps[swapIdx].id}`, { sequence: steps[idx].sequence }),
      ]);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['soe', eventId] }),
  });

  return (
    <div style={{ minHeight: 600, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="fixed inset-0 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">Edit SOE steps</h2>
            <p className="text-xs text-gray-400 mt-0.5">{steps.length} steps · Changes are logged as deviations (FR2.6)</p>
          </div>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading SOE…</div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {steps.map((step, idx) => (
              <div key={step.id}>
                {editingId === step.id ? (
                  <StepEditForm
                    step={step}
                    onSave={(data) => updateStep.mutate({ id: step.id, data })}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <div className={clsx('flex items-center gap-3 bg-white border rounded-xl px-4 py-3', step.is_on_critical_path ? 'border-red-200 bg-red-50/30' : 'border-gray-200')}>
                    <span className="text-xs text-gray-400 font-mono w-5 shrink-0">{step.sequence}</span>
                    {step.step_type === 'AUTOMATED' ? <Bot size={14} className="text-purple-500 shrink-0" /> : <User size={14} className="text-gray-400 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {step.is_on_critical_path && <span className="text-red-500 text-xs">★</span>}
                        <span className="text-sm font-medium text-gray-900 truncate">{step.name}</span>
                        <span className="text-xs text-gray-400">{step.swim_lane}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{step.description?.slice(0, 80)}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{step.estimated_duration_minutes}m</span>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => moveStep.mutate({ id: step.id, direction: 'up' })} disabled={idx === 0} className="p-1 hover:bg-gray-100 rounded text-gray-400 disabled:opacity-30"><ArrowUp size={13} /></button>
                      <button onClick={() => moveStep.mutate({ id: step.id, direction: 'down' })} disabled={idx === steps.length - 1} className="p-1 hover:bg-gray-100 rounded text-gray-400 disabled:opacity-30"><ArrowDown size={13} /></button>
                      <button onClick={() => setEditingId(step.id)} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700"><Edit2 size={13} /></button>
                      <button onClick={() => { if (window.confirm(`Remove step "${step.name}"?`)) deleteStep.mutate(step.id); }} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {addingNew ? (
              <StepEditForm
                step={{ step_type: 'HUMAN', swim_lane: '', estimated_duration_minutes: 15, is_on_critical_path: false, requires_approval: false }}
                onSave={(data) => addStep.mutate(data)}
                onCancel={() => setAddingNew(false)}
              />
            ) : (
              <button onClick={() => setAddingNew(true)} className="w-full flex items-center justify-center gap-2 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-xl py-3 hover:border-brand-400 hover:text-brand-600 transition-colors">
                <Plus size={15} /> Add step
              </button>
            )}
          </div>
        )}

        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <div className="flex gap-3 items-start">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Deviation rationale (logged to audit)</label>
              <input value={deviationNote} onChange={e => setDeviationNote(e.target.value)} placeholder="Why are you editing this SOE?" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-400" />
            </div>
            <button onClick={onClose} className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 mt-5">Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}
