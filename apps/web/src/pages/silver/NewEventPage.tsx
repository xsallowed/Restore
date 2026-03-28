// ── NewEventPage ─────────────────────────────────────────────────────────────
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { eventsApi, servicesApi } from '../../lib/api';
import { useQuery } from '@tanstack/react-query';

const schema = z.object({
  title: z.string().min(3, 'Title required'),
  eventType: z.string().min(1, 'Event type required'),
  severity: z.enum(['P1', 'P2', 'P3', 'P4']),
  affectedServiceIds: z.array(z.string()).default([]),
  notes: z.string().optional(),
  isRehearsal: z.boolean().default(false),
});
type Form = z.infer<typeof schema>;

export function NewEventPage() {
  const navigate = useNavigate();
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { severity: 'P2', affectedServiceIds: [], isRehearsal: false },
  });

  const { data: servicesData } = useQuery({
    queryKey: ['business-services'],
    queryFn: () => servicesApi.list().then(r => r.data.data),
  });

  const services: { id: string; name: string }[] = (servicesData as { id: string; name: string }[]) ?? [];
  const selectedServiceIds = watch('affectedServiceIds');

  const createMutation = useMutation({
    mutationFn: (data: Form) => eventsApi.create(data),
    onSuccess: (res) => {
      toast.success('Recovery event opened — SOE is being generated');
      navigate(`/events/${res.data.data.id}`);
    },
    onError: () => toast.error('Failed to open event'),
  });

  const EVENT_TYPES = [
    'RANSOMWARE', 'DDoS', 'DATA_EXFILTRATION', 'INSIDER_THREAT',
    'SUPPLY_CHAIN_COMPROMISE', 'INFRASTRUCTURE_FAILURE', 'DATABASE_CORRUPTION',
    'NETWORK_DISRUPTION', 'CLOUD_REGION_FAILURE', 'DR_ACTIVATION',
    'THIRD_PARTY_OUTAGE', 'MAJOR_INCIDENT',
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Open Recovery Event</h1>
        <p className="text-sm text-gray-500 mt-1">Restore will generate a Sequence of Events from your runbooks</p>
      </div>

      <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="space-y-5">
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event title</label>
            <input {...register('title')} placeholder="e.g. Ransomware attack on Finance systems" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event type</label>
              <select {...register('eventType')} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                <option value="">Select type…</option>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
              {errors.eventType && <p className="text-red-500 text-xs mt-1">{errors.eventType.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
              <select {...register('severity')} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white">
                <option value="P1">P1 — Critical</option>
                <option value="P2">P2 — High</option>
                <option value="P3">P3 — Medium</option>
                <option value="P4">P4 — Low</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Affected business services</label>
            <div className="flex flex-wrap gap-2">
              {services.map(s => (
                <label key={s.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    value={s.id}
                    checked={selectedServiceIds.includes(s.id)}
                    onChange={e => {
                      const ids = e.target.checked
                        ? [...selectedServiceIds, s.id]
                        : selectedServiceIds.filter(id => id !== s.id);
                      setValue('affectedServiceIds', ids);
                    }}
                    className="rounded"
                  />
                  {s.name}
                </label>
              ))}
              {services.length === 0 && <p className="text-xs text-gray-400">No services configured</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea {...register('notes')} placeholder="Initial observations, affected systems, context…" rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register('isRehearsal')} className="rounded" />
            <span>This is a <strong>Dress Rehearsal</strong> — no live systems will be affected</span>
          </label>
        </div>

        <div className="flex gap-3">
          <button type="button" onClick={() => navigate(-1)} className="px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting} className="flex-1 bg-brand-600 text-white font-medium py-2.5 rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50 transition-colors">
            {isSubmitting ? 'Opening event…' : 'Open Recovery Event & Generate SOE'}
          </button>
        </div>
      </form>
    </div>
  );
}
