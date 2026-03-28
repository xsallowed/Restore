import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetsApi, servicesApi, api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, Link, Upload, X, Network } from 'lucide-react';
import clsx from 'clsx';

const ASSET_TYPES = ['SERVER','DATABASE','NETWORK','CLOUD_SERVICE','SAAS','API','MIDDLEWARE','STORAGE','ENDPOINT','CONTAINER','KUBERNETES_CLUSTER','LOAD_BALANCER','FIREWALL','OTHER'];
const ENVIRONMENTS = ['PRODUCTION','STAGING','DR','DEV'];
const RELATIONSHIP_TYPES = ['HOSTS','REQUIRES','CONSUMES','REPLICATES_TO','LOAD_BALANCES'];
const STATUS_COLORS: Record<string, string> = { HEALTHY:'bg-green-100 text-green-800', DEGRADED:'bg-yellow-100 text-yellow-800', CRITICAL:'bg-orange-100 text-orange-800', OFFLINE:'bg-red-100 text-red-800', UNKNOWN:'bg-dark-700 text-gray-600' };

interface Asset { id: string; name: string; asset_type: string; environment: string; criticality_tier: number; status: string; owner?: string; location?: string; recovery_group?: string; business_services?: string[]; }

function AssetForm({ asset, onClose, onSaved }: { asset?: Asset; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: asset?.name ?? '', assetType: asset?.asset_type ?? 'SERVER', environment: asset?.environment ?? 'PRODUCTION', owner: asset?.owner ?? '', criticalityTier: asset?.criticality_tier ?? 2, location: asset?.location ?? '', recoveryGroup: asset?.recovery_group ?? '' });
  const mutation = useMutation({
    mutationFn: () => asset
      ? api.patch(`/assets/${asset.id}`, { name: form.name, assetType: form.assetType, environment: form.environment, owner: form.owner || null, criticalityTier: form.criticalityTier, location: form.location || null, recoveryGroup: form.recoveryGroup || null })
      : assetsApi.create({ ...form, owner: form.owner || null, location: form.location || null, recoveryGroup: form.recoveryGroup || null }),
    onSuccess: () => { toast.success(asset ? 'Asset updated' : 'Asset created'); onSaved(); onClose(); },
    onError: () => toast.error('Failed to save asset'),
  });
  return (
    <div style={{ minHeight: 520, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="bg-dark-900 bg-opacity-50 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="font-semibold text-white">{asset ? 'Edit asset' : 'Add asset'}</h2>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-5 py-4 grid grid-cols-2 gap-4 max-h-96 overflow-y-auto">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Asset name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. prod-db-primary-01" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Asset type *</label>
            <select value={form.assetType} onChange={e => setForm(f => ({ ...f, assetType: e.target.value }))} className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-dark-900 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-400">
              {ASSET_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Environment *</label>
            <select value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))} className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-dark-900 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-400">
              {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Criticality tier</label>
            <select value={form.criticalityTier} onChange={e => setForm(f => ({ ...f, criticalityTier: parseInt(e.target.value) }))} className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-dark-900 bg-opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-400">
              {[1,2,3,4].map(t => <option key={t} value={t}>Tier {t}{t===1?' (Critical)':t===4?' (Low)':''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Owner</label>
            <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="Team or person name" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. us-east-1, DC-London" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Recovery group</label>
            <input value={form.recoveryGroup} onChange={e => setForm(f => ({ ...f, recoveryGroup: e.target.value }))} placeholder="e.g. DATABASE_TIER, NETWORK_CORE" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
        </div>
        <div className="px-5 pb-5 pt-3 flex gap-3 border-t border-gray-700">
          <button onClick={onClose} className="flex-1 text-sm border border-gray-600 py-2.5 rounded-lg hover:bg-dark-800">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!form.name || mutation.isPending} className="flex-1 text-sm bg-brand-600 text-white py-2.5 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {mutation.isPending ? 'Saving…' : asset ? 'Save changes' : 'Add asset'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DependencyModal({ asset, allAssets, onClose }: { asset: Asset; allAssets: Asset[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [sourceId, setSourceId] = useState(asset.id);
  const [targetId, setTargetId] = useState('');
  const [relType, setRelType] = useState('REQUIRES');
  const { data: depsData } = useQuery({ queryKey: ['dependencies'], queryFn: () => api.get('/assets/dependencies').then(r => r.data.data) });
  const deps: Array<{ source: string; target: string; relationship_type: string }> = (depsData as Array<{ source: string; target: string; relationship_type: string }>) ?? [];
  const myDeps = deps.filter(d => d.source === asset.id || d.target === asset.id);
  const addDep = useMutation({
    mutationFn: () => api.post('/assets/dependencies', { sourceAssetId: sourceId, targetAssetId: targetId, relationshipType: relType }),
    onSuccess: () => { toast.success('Dependency added'); qc.invalidateQueries({ queryKey: ['dependencies'] }); setTargetId(''); },
    onError: () => toast.error('Failed to add dependency'),
  });
  const assetName = (id: string) => allAssets.find(a => a.id === id)?.name ?? id.slice(0,8) + '…';
  return (
    <div style={{ minHeight: 460, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="bg-dark-900 bg-opacity-50 rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2"><Network size={16} className="text-brand-500" /><h2 className="font-semibold text-white text-sm">Dependencies — {asset.name}</h2></div>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-xs text-gray-500 mb-1 block">Source</label>
              <select value={sourceId} onChange={e => setSourceId(e.target.value)} className="w-full border border-gray-600 rounded-lg px-2 py-2 text-xs bg-dark-900 bg-opacity-50 focus:outline-none">
                {allAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-gray-500 mb-1 block">Relationship</label>
              <select value={relType} onChange={e => setRelType(e.target.value)} className="w-full border border-gray-600 rounded-lg px-2 py-2 text-xs bg-dark-900 bg-opacity-50 focus:outline-none">
                {RELATIONSHIP_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-gray-500 mb-1 block">Target *</label>
              <select value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full border border-gray-600 rounded-lg px-2 py-2 text-xs bg-dark-900 bg-opacity-50 focus:outline-none">
                <option value="">Select…</option>
                {allAssets.filter(a => a.id !== sourceId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          </div>
          <button onClick={() => addDep.mutate()} disabled={!targetId || addDep.isPending} className="text-xs bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {addDep.isPending ? 'Adding…' : '+ Add dependency'}
          </button>
          {myDeps.length > 0 && (
            <div className="border-t border-gray-700 pt-3 space-y-1">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Current dependencies</p>
              {myDeps.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-dark-800 rounded px-3 py-2">
                  <span className="font-medium">{assetName(d.source)}</span>
                  <span className="text-gray-400 text-[10px] bg-gray-200 px-1.5 py-0.5 rounded">{d.relationship_type}</span>
                  <span className="font-medium">{assetName(d.target)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AssetRegistryPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [depAsset, setDepAsset] = useState<Asset | null>(null);
  const [csvText, setCsvText] = useState('');
  const [showCsv, setShowCsv] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['assets'], queryFn: () => assetsApi.list().then(r => r.data.data) });
  const assets: Asset[] = (data as Asset[]) ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/assets/${id}`),
    onSuccess: () => { toast.success('Asset deleted'); qc.invalidateQueries({ queryKey: ['assets'] }); },
    onError: () => toast.error('Failed to delete asset'),
  });

  const csvMutation = useMutation({
    mutationFn: async (csv: string) => {
      const lines = csv.trim().split('\n').slice(1);
      for (const line of lines) {
        const [name, assetType, environment, criticalityTier, owner, location, recoveryGroup] = line.split(',').map(s => s.trim());
        if (!name) continue;
        await assetsApi.create({ name, assetType: assetType || 'SERVER', environment: environment || 'PRODUCTION', criticalityTier: parseInt(criticalityTier) || 2, owner: owner || null, location: location || null, recoveryGroup: recoveryGroup || null });
      }
    },
    onSuccess: () => { toast.success('CSV imported'); qc.invalidateQueries({ queryKey: ['assets'] }); setShowCsv(false); setCsvText(''); },
    onError: () => toast.error('CSV import failed'),
  });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-white">Technology Asset Registry</h1><p className="text-sm text-gray-500 mt-0.5">{assets.length} assets · FR0.1.1</p></div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/assets/graph')} className="flex items-center gap-1.5 text-sm border border-gray-600 px-3 py-2 rounded-lg hover:bg-dark-800"><Network size={14} /> Graph</button>
          <button onClick={() => setShowCsv(s => !s)} className="flex items-center gap-1.5 text-sm border border-gray-600 px-3 py-2 rounded-lg hover:bg-dark-800"><Upload size={14} /> CSV import</button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-3 py-2 rounded-lg hover:bg-brand-700"><Plus size={14} /> Add asset</button>
        </div>
      </div>

      {showCsv && (
        <div className="bg-dark-800 border border-blue-200 rounded-xl p-4 mb-4">
          <p className="text-xs text-blue-700 font-medium mb-1">CSV columns: name, assetType, environment, criticalityTier, owner, location, recoveryGroup</p>
          <p className="text-xs text-blue-500 mb-2">Row 1 is treated as a header and skipped. Example: prod-db-01, DATABASE, PRODUCTION, 1, DBA Team, us-east-1, DATABASE_TIER</p>
          <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={4} placeholder="name,assetType,environment,criticalityTier,owner,location,recoveryGroup&#10;prod-db-01,DATABASE,PRODUCTION,1,DBA Team,us-east-1,DATABASE_TIER" className="w-full border border-blue-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none resize-none" />
          <div className="flex gap-2 mt-2">
            <button onClick={() => csvMutation.mutate(csvText)} disabled={!csvText.trim() || csvMutation.isPending} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">{csvMutation.isPending ? 'Importing…' : 'Import'}</button>
            <button onClick={() => setShowCsv(false)} className="text-xs text-blue-600 px-3 py-1.5">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
      ) : (
        <div className="bg-dark-900 bg-opacity-50 border border-gray-600 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-dark-800 border-b border-gray-700 text-left">
              {['Asset','Type','Env','Tier','Owner','Location','Recovery Group','Status','Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {assets.map(asset => (
                <tr key={asset.id} className="hover:bg-dark-800">
                  <td className="px-4 py-3 font-medium text-white">{asset.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{asset.asset_type}</td>
                  <td className="px-4 py-3 text-xs"><span className="bg-dark-700 text-gray-300 px-1.5 py-0.5 rounded">{asset.environment}</span></td>
                  <td className="px-4 py-3 text-center text-xs font-bold text-gray-300">T{asset.criticality_tier}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{asset.owner || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{asset.location || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{asset.recovery_group || '—'}</td>
                  <td className="px-4 py-3"><span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', STATUS_COLORS[asset.status] ?? STATUS_COLORS.UNKNOWN)}>{asset.status}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setEditAsset(asset)} className="p-1.5 hover:bg-dark-700 rounded text-gray-400 hover:text-gray-300" title="Edit"><Edit2 size={13} /></button>
                      <button onClick={() => setDepAsset(asset)} className="p-1.5 hover:bg-dark-700 rounded text-gray-400 hover:text-blue-500" title="Dependencies"><Link size={13} /></button>
                      <button onClick={() => { if (window.confirm(`Delete ${asset.name}?`)) deleteMutation.mutate(asset.id); }} className="p-1.5 hover:bg-dark-800 rounded text-gray-400 hover:text-red-500" title="Delete"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {assets.length === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-gray-400 text-sm mb-3">No assets yet — add your first asset or import via CSV</p>
              <button onClick={() => setShowAdd(true)} className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 inline-flex items-center gap-2"><Plus size={14} /> Add first asset</button>
            </div>
          )}
        </div>
      )}

      {(showAdd || editAsset) && (<div className="fixed inset-0 z-50"><AssetForm asset={editAsset ?? undefined} onClose={() => { setShowAdd(false); setEditAsset(null); }} onSaved={() => qc.invalidateQueries({ queryKey: ['assets'] })} /></div>)}
      {depAsset && (<div className="fixed inset-0 z-50"><DependencyModal asset={depAsset} allAssets={assets} onClose={() => setDepAsset(null)} /></div>)}
    </div>
  );
}
