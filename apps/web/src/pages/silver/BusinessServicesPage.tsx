import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { servicesApi, assetsApi, api } from '../../lib/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Link, X, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';

const STATUS_CONFIG: Record<string, { bg: string; label: string }> = {
  OPERATIONAL:        { bg: 'bg-green-100 text-green-800',  label: 'Operational' },
  DEGRADED:           { bg: 'bg-yellow-100 text-yellow-800', label: 'Degraded' },
  PARTIALLY_IMPACTED: { bg: 'bg-orange-100 text-orange-800', label: 'Partial Impact' },
  DOWN:               { bg: 'bg-red-100 text-red-800',       label: 'Down' },
  RECOVERING:         { bg: 'bg-blue-100 text-blue-800',     label: 'Recovering' },
  RESTORED:           { bg: 'bg-green-100 text-green-700',   label: 'Restored' },
};

interface Service { id: string; name: string; business_unit: string; impact_tier: number; rto_minutes: number; status: string; asset_count?: number; }
interface Asset { id: string; name: string; asset_type: string; criticality_tier: number; }

function ServiceForm({ service, onClose, onSaved }: { service?: Service; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: service?.name ?? '', businessUnit: service?.business_unit ?? '',
    impactTier: service?.impact_tier ?? 2, rtoMinutes: service?.rto_minutes ?? 240,
  });
  const mutation = useMutation({
    mutationFn: () => service
      ? api.patch(`/business-services/${service.id}`, form)
      : api.post('/business-services', form),
    onSuccess: () => { toast.success(service ? 'Service updated' : 'Service created'); onSaved(); onClose(); },
    onError: () => toast.error('Failed to save service'),
  });
  return (
    <div style={{ minHeight: 420, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="bg-dark-900 bg-opacity-50 rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="font-semibold text-white">{service ? 'Edit business service' : 'Add business service'}</h2>
          <button onClick={onClose}><X size={16} className="text-white" /></button>
        </div>
        <div className="px-5 py-4 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Service name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Online Banking Portal" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Business unit *</label>
            <input value={form.businessUnit} onChange={e => setForm(f => ({ ...f, businessUnit: e.target.value }))} placeholder="e.g. Retail Banking, IT Operations" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Impact tier</label>
            <select value={form.impactTier} onChange={e => setForm(f => ({ ...f, impactTier: parseInt(e.target.value) }))} className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-dark-900 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-400">
              {[1,2,3,4].map(t => <option key={t} value={t}>Tier {t}{t===1?' (Mission Critical)':t===2?' (Important)':t===3?' (Standard)':' (Low)'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">RTO target (minutes)</label>
            <input type="number" value={form.rtoMinutes} onChange={e => setForm(f => ({ ...f, rtoMinutes: parseInt(e.target.value) || 240 }))} className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
        </div>
        <div className="px-5 pb-5 pt-3 flex gap-3 border-t border-gray-700">
          <button onClick={onClose} className="flex-1 text-sm border border-gray-600 py-2.5 rounded-lg hover:bg-dark-800">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!form.name || !form.businessUnit || mutation.isPending} className="flex-1 text-sm bg-brand-600 text-white py-2.5 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {mutation.isPending ? 'Saving…' : service ? 'Save changes' : 'Add service'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssetLinkModal({ service, onClose }: { service: Service; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: allAssetsData } = useQuery({ queryKey: ['assets'], queryFn: () => assetsApi.list().then(r => r.data.data) });
  const { data: linkedData } = useQuery({ queryKey: ['service-assets', service.id], queryFn: () => api.get(`/business-services/${service.id}/assets`).then(r => r.data.data) });
  const allAssets: Asset[] = (allAssetsData as Asset[]) ?? [];
  const linkedIds: string[] = ((linkedData as { id: string }[]) ?? []).map(a => a.id);

  const toggle = useMutation({
    mutationFn: ({ assetId, link }: { assetId: string; link: boolean }) =>
      link
        ? api.post(`/business-services/${service.id}/assets`, { assetId })
        : api.delete(`/business-services/${service.id}/assets/${assetId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-assets', service.id] }),
    onError: () => toast.error('Failed to update asset link'),
  });

  return (
    <div style={{ minHeight: 480, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="bg-dark-900 bg-opacity-50 rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2"><Link size={16} className="text-brand-500" /><h2 className="font-semibold text-white text-sm">Assets — {service.name}</h2></div>
          <button onClick={onClose}><X size={16} className="text-white" /></button>
        </div>
        <div className="px-5 py-3 max-h-80 overflow-y-auto divide-y divide-gray-50">
          {allAssets.length === 0 && <p className="text-sm text-white py-4 text-center">No assets registered yet. Add assets first.</p>}
          {allAssets.map(asset => {
            const linked = linkedIds.includes(asset.id);
            return (
              <div key={asset.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-white">{asset.name}</p>
                  <p className="text-xs text-white">{asset.asset_type} · T{asset.criticality_tier}</p>
                </div>
                <button
                  onClick={() => toggle.mutate({ assetId: asset.id, link: !linked })}
                  className={clsx('text-xs px-3 py-1.5 rounded-lg font-medium transition-colors', linked ? 'bg-green-100 text-green-800 hover:bg-red-100 hover:text-red-700' : 'bg-dark-700 text-gray-600 hover:bg-brand-50 hover:text-brand-700')}
                >
                  {linked ? 'Linked ✓' : 'Link'}
                </button>
              </div>
            );
          })}
        </div>
        <div className="px-5 pb-4 pt-3 border-t border-gray-700">
          <p className="text-xs text-white">{linkedIds.length} asset{linkedIds.length !== 1 ? 's' : ''} linked to this service</p>
        </div>
      </div>
    </div>
  );
}

export function BusinessServicesPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [linkService, setLinkService] = useState<Service | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['business-services'], queryFn: () => servicesApi.list().then(r => r.data.data), refetchInterval: 30_000 });
  const services: Service[] = (data as Service[]) ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/business-services/${id}`),
    onSuccess: () => { toast.success('Service deleted'); qc.invalidateQueries({ queryKey: ['business-services'] }); },
    onError: () => toast.error('Failed to delete service'),
  });

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Business Services</h1>
          <p className="text-sm text-gray-300 mt-0.5">{services.length} services · map assets to recovery scope · FR0.1.3</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700">
          <Plus size={14} /> Add service
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-white text-sm">Loading…</div>
      ) : (
        <div className="space-y-2">
          {services.map(service => {
            const cfg = STATUS_CONFIG[service.status] ?? STATUS_CONFIG.OPERATIONAL;
            const isExpanded = expanded === service.id;
            const rtoHours = service.rto_minutes >= 60 ? `${Math.round(service.rto_minutes / 60 * 10) / 10}h` : `${service.rto_minutes}m`;
            return (
              <div key={service.id} className="bg-dark-900 bg-opacity-50 border border-gray-600 rounded-xl overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={clsx('text-xs font-bold px-1.5 py-0.5 rounded', 'bg-dark-700 text-gray-600')}>T{service.impact_tier}</span>
                      <h3 className="font-semibold text-white">{service.name}</h3>
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', cfg.bg)}>{cfg.label}</span>
                    </div>
                    <p className="text-xs text-gray-300">{service.business_unit} · RTO: {rtoHours} · {service.asset_count ?? 0} assets</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setLinkService(service)} className="flex items-center gap-1 text-xs border border-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-dark-800 text-gray-600">
                      <Link size={12} /> Assets
                    </button>
                    <button onClick={() => setEditService(service)} className="p-1.5 hover:bg-dark-700 rounded text-white hover:text-gray-300"><Edit2 size={14} /></button>
                    <button onClick={() => { if (window.confirm(`Delete ${service.name}?`)) deleteMutation.mutate(service.id); }} className="p-1.5 hover:bg-dark-800 rounded text-white hover:text-red-500"><Trash2 size={14} /></button>
                    <button onClick={() => setExpanded(isExpanded ? null : service.id)} className="p-1.5 text-white">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-5 pb-4 pt-1 border-t border-gray-700 bg-dark-800/50">
                    <div className="grid grid-cols-4 gap-3 text-xs">
                      <div><span className="text-white">Impact tier</span><p className="font-medium mt-0.5">Tier {service.impact_tier}</p></div>
                      <div><span className="text-white">RTO target</span><p className="font-medium mt-0.5">{rtoHours}</p></div>
                      <div><span className="text-white">Business unit</span><p className="font-medium mt-0.5">{service.business_unit}</p></div>
                      <div><span className="text-white">Status</span><p className="font-medium mt-0.5">{cfg.label}</p></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {services.length === 0 && (
            <div className="bg-dark-800 border border-gray-600 rounded-xl p-10 text-center">
              <p className="text-white text-sm mb-3">No business services defined yet</p>
              <p className="text-white text-xs mb-4">Define your business services first, then link the technology assets that support each service</p>
              <button onClick={() => setShowAdd(true)} className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 inline-flex items-center gap-2"><Plus size={14} /> Add first service</button>
            </div>
          )}
        </div>
      )}

      {(showAdd || editService) && (<div className="fixed inset-0 z-50"><ServiceForm service={editService ?? undefined} onClose={() => { setShowAdd(false); setEditService(null); }} onSaved={() => qc.invalidateQueries({ queryKey: ['business-services'] })} /></div>)}
      {linkService && (<div className="fixed inset-0 z-50"><AssetLinkModal service={linkService} onClose={() => { setLinkService(null); qc.invalidateQueries({ queryKey: ['business-services'] }); }} /></div>)}
    </div>
  );
}
