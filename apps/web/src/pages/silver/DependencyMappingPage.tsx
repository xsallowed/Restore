import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, assetsApi, servicesApi } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Plus, X, Link, BookOpen, Zap, Search, ChevronRight,
  Edit2, Trash2, Eye, Network, Table, ArrowRight,
  CheckCircle2, AlertCircle, Clock, FileText, Tag,
  Layers, RefreshCw, Play, ExternalLink
} from 'lucide-react';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Asset { id: string; name: string; asset_type: string; environment: string; criticality_tier: number; status: string; owner?: string; recovery_group?: string; }
interface Service { id: string; name: string; business_unit: string; impact_tier: number; rto_minutes: number; status: string; asset_count?: number; }
interface Dependency { source: string; target: string; relationship_type: string; }
interface Runbook { id: string; title: string; source_ref: string; event_tags: string[]; fetched_at: string; content_text?: string; }

const STATUS_DOT: Record<string, string> = {
  HEALTHY: '#22c55e', DEGRADED: '#eab308', CRITICAL: '#f97316', OFFLINE: '#ef4444', UNKNOWN: '#9ca3af',
  OPERATIONAL: '#22c55e', DOWN: '#ef4444', RECOVERING: '#3b82f6', RESTORED: '#4ade80',
};

const TIER_COLOR: Record<number, string> = { 1: '#ef4444', 2: '#f97316', 3: '#3b82f6', 4: '#9ca3af' };
const REL_TYPES = ['HOSTS', 'REQUIRES', 'CONSUMES', 'REPLICATES_TO', 'LOAD_BALANCES'];
const REL_LABELS: Record<string, string> = { HOSTS: 'hosts', REQUIRES: 'requires', CONSUMES: 'consumes', REPLICATES_TO: 'replicates to', LOAD_BALANCES: 'load balances' };

// ─── Dependency Graph Canvas ───────────────────────────────────────────────
function DependencyGraphCanvas({ assets, dependencies, selectedId, onSelect }: {
  assets: Asset[];
  dependencies: Dependency[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Array<Asset & { x: number; y: number; vx: number; vy: number }>>([]);
  const rafRef = useRef<number>();
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !assets.length) return;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W;
    canvas.height = H;

    // Init nodes with stable positions based on criticality rings
    nodesRef.current = assets.map((a, i) => {
      const existing = nodesRef.current.find(n => n.id === a.id);
      if (existing) return { ...a, x: existing.x, y: existing.y, vx: existing.vx, vy: existing.vy };
      const ring = (a.criticality_tier - 1) * 80 + 80;
      const angle = (i / assets.length) * Math.PI * 2;
      return { ...a, x: W / 2 + Math.cos(angle) * ring, y: H / 2 + Math.sin(angle) * ring, vx: 0, vy: 0 };
    });

    const ctx = canvas.getContext('2d')!;

    function tick() {
      const ns = nodesRef.current;
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x, dy = ns[j].y - ns[i].y;
          const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const f = 3000 / (d * d);
          const fx = (dx / d) * f, fy = (dy / d) * f;
          ns[i].vx -= fx; ns[i].vy -= fy;
          ns[j].vx += fx; ns[j].vy += fy;
        }
      }
      for (const dep of dependencies) {
        const src = ns.find(n => n.id === dep.source);
        const tgt = ns.find(n => n.id === dep.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x, dy = tgt.y - src.y;
        const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const f = (d - 120) * 0.03;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        src.vx += fx; src.vy += fy;
        tgt.vx -= fx; tgt.vy -= fy;
      }
      for (const n of ns) {
        n.vx += (W / 2 - n.x) * 0.003;
        n.vy += (H / 2 - n.y) * 0.003;
        n.vx *= 0.82; n.vy *= 0.82;
        n.x = Math.max(30, Math.min(W - 30, n.x + n.vx));
        n.y = Math.max(30, Math.min(H - 30, n.y + n.vy));
      }

      ctx.clearRect(0, 0, W, H);

      // Draw edges with arrows
      for (const dep of dependencies) {
        const src = ns.find(n => n.id === dep.source);
        const tgt = ns.find(n => n.id === dep.target);
        if (!src || !tgt) continue;
        const isHighlighted = src.id === selectedId || tgt.id === selectedId;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = isHighlighted ? '#3b82f6' : '#d1d5db';
        ctx.lineWidth = isHighlighted ? 2 : 1;
        ctx.setLineDash(dep.relationship_type === 'REPLICATES_TO' ? [5, 3] : []);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrowhead
        const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x);
        const ar = 14;
        ctx.beginPath();
        ctx.moveTo(tgt.x - ar * Math.cos(angle - 0.4), tgt.y - ar * Math.sin(angle - 0.4));
        ctx.lineTo(tgt.x - 16 * Math.cos(angle), tgt.y - 16 * Math.sin(angle));
        ctx.lineTo(tgt.x - ar * Math.cos(angle + 0.4), tgt.y - ar * Math.sin(angle + 0.4));
        ctx.fillStyle = isHighlighted ? '#3b82f6' : '#d1d5db';
        ctx.fill();

        // Relationship label
        if (isHighlighted) {
          const mx = (src.x + tgt.x) / 2, my = (src.y + tgt.y) / 2;
          ctx.fillStyle = '#1e40af';
          ctx.font = '10px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(REL_LABELS[dep.relationship_type] || dep.relationship_type, mx, my - 6);
        }
      }

      // Draw nodes
      for (const n of ns) {
        const r = n.criticality_tier === 1 ? 18 : n.criticality_tier === 2 ? 15 : n.criticality_tier === 3 ? 12 : 10;
        const isSelected = n.id === selectedId;
        const color = STATUS_DOT[n.status] ?? '#9ca3af';

        if (isSelected) {
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(59,130,246,0.15)'; ctx.fill();
          ctx.beginPath(); ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.stroke();
        }

        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = isSelected ? '#3b82f6' : '#fff';
        ctx.lineWidth = isSelected ? 2.5 : 1.5; ctx.stroke();

        // Tier badge
        ctx.fillStyle = TIER_COLOR[n.criticality_tier] ?? '#9ca3af';
        ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('T' + n.criticality_tier, n.x, n.y + 3.5);

        // Name label
        ctx.fillStyle = isSelected ? '#1e40af' : '#374151';
        ctx.font = `${Math.max(10, r - 2)}px system-ui`;
        ctx.fillText(n.name.length > 14 ? n.name.slice(0, 13) + '…' : n.name, n.x, n.y + r + 13);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [assets, dependencies, selectedId]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    for (const n of nodesRef.current) {
      const r = n.criticality_tier === 1 ? 18 : 15;
      if (Math.hypot(n.x - mx, n.y - my) <= r + 5) {
        onSelect(n.id === selectedId ? null : n.id);
        return;
      }
    }
    onSelect(null);
  }, [selectedId, onSelect]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    for (const n of nodesRef.current) {
      if (Math.hypot(n.x - mx, n.y - my) <= 20) {
        setTooltip({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 8, name: `${n.name} (${n.asset_type})` });
        return;
      }
    }
    setTooltip(null);
  }, []);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full cursor-pointer" onClick={handleClick} onMouseMove={handleMouseMove} />
      {tooltip && (
        <div className="absolute pointer-events-none bg-gray-900 text-white text-xs px-2 py-1 rounded-lg shadow-lg z-10" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.name}
        </div>
      )}
      {assets.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <Network size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No assets to display</p>
            <p className="text-xs mt-1">Add assets to see the dependency graph</p>
          </div>
        </div>
      )}
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-dark-900 bg-opacity-50/90 backdrop-blur rounded-lg px-3 py-2 text-xs border border-gray-700 space-y-1">
        {Object.entries(STATUS_DOT).slice(0, 5).map(([s, c]) => (
          <div key={s} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ background: c }} />
            <span className="text-gray-500">{s}</span>
          </div>
        ))}
        <div className="border-t border-gray-700 pt-1 text-gray-400">Click node to select</div>
      </div>
    </div>
  );
}

// ─── Dependency Table ──────────────────────────────────────────────────────
function DependencyTable({ assets, dependencies, selectedId, onSelect }: {
  assets: Asset[];
  dependencies: Dependency[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const qc = useQueryClient();
  const assetMap = new Map(assets.map(a => [a.id, a]));
  const [addRow, setAddRow] = useState(false);
  const [src, setSrc] = useState('');
  const [tgt, setTgt] = useState('');
  const [rel, setRel] = useState('REQUIRES');

  const filtered = selectedId
    ? dependencies.filter(d => d.source === selectedId || d.target === selectedId)
    : dependencies;

  const addDep = useMutation({
    mutationFn: () => api.post('/assets/dependencies', { sourceAssetId: src, targetAssetId: tgt, relationshipType: rel }),
    onSuccess: () => { toast.success('Dependency added'); qc.invalidateQueries({ queryKey: ['dependencies'] }); setAddRow(false); setSrc(''); setTgt(''); },
    onError: () => toast.error('Failed to add dependency'),
  });

  const REL_BADGE: Record<string, string> = {
    HOSTS: 'bg-purple-100 text-purple-800',
    REQUIRES: 'bg-blue-100 text-blue-800',
    CONSUMES: 'bg-green-100 text-green-800',
    REPLICATES_TO: 'bg-amber-100 text-amber-800',
    LOAD_BALANCES: 'bg-dark-700 text-gray-300',
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">{filtered.length} dependencies {selectedId ? '(filtered)' : ''}</span>
          {selectedId && <button onClick={() => onSelect('')} className="text-xs text-brand-600 hover:underline">Clear filter</button>}
        </div>
        <button onClick={() => setAddRow(r => !r)} className="flex items-center gap-1 text-xs bg-brand-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-brand-700">
          <Plus size={12} /> Add
        </button>
      </div>

      {addRow && (
        <div className="px-4 py-3 bg-dark-800 border-b border-blue-100 flex items-center gap-2 flex-wrap shrink-0">
          <select value={src} onChange={e => setSrc(e.target.value)} className="text-xs border border-gray-600 rounded-lg px-2 py-1.5 bg-dark-900 bg-opacity-50 focus:outline-none focus:ring-1 focus:ring-brand-400">
            <option value="">Source asset…</option>
            {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={rel} onChange={e => setRel(e.target.value)} className="text-xs border border-gray-600 rounded-lg px-2 py-1.5 bg-dark-900 bg-opacity-50 focus:outline-none focus:ring-1 focus:ring-brand-400">
            {REL_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={tgt} onChange={e => setTgt(e.target.value)} className="text-xs border border-gray-600 rounded-lg px-2 py-1.5 bg-dark-900 bg-opacity-50 focus:outline-none focus:ring-1 focus:ring-brand-400">
            <option value="">Target asset…</option>
            {assets.filter(a => a.id !== src).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <button onClick={() => addDep.mutate()} disabled={!src || !tgt || addDep.isPending} className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {addDep.isPending ? 'Adding…' : 'Add'}
          </button>
          <button onClick={() => setAddRow(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
        </div>
      )}

      <div className="overflow-y-auto flex-1">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-dark-800 border-b border-gray-700">
            <tr>{['Source','Relationship','Target','Source Tier','Target Tier'].map(h => <th key={h} className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((d, i) => {
              const src = assetMap.get(d.source);
              const tgt = assetMap.get(d.target);
              const isHighlighted = d.source === selectedId || d.target === selectedId;
              return (
                <tr key={i} className={clsx('hover:bg-dark-800 cursor-pointer', isHighlighted && 'bg-dark-800/50')}>
                  <td className="px-4 py-2.5" onClick={() => onSelect(d.source)}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_DOT[src?.status ?? 'UNKNOWN'] }} />
                      <span className="font-medium text-white">{src?.name ?? d.source.slice(0, 8)}</span>
                    </div>
                    <p className="text-gray-400 ml-3.5">{src?.asset_type}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium', REL_BADGE[d.relationship_type] ?? 'bg-dark-700 text-gray-600')}>{d.relationship_type}</span>
                      <ArrowRight size={10} className="text-gray-300" />
                    </div>
                  </td>
                  <td className="px-4 py-2.5" onClick={() => onSelect(d.target)}>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_DOT[tgt?.status ?? 'UNKNOWN'] }} />
                      <span className="font-medium text-white">{tgt?.name ?? d.target.slice(0, 8)}</span>
                    </div>
                    <p className="text-gray-400 ml-3.5">{tgt?.asset_type}</p>
                  </td>
                  <td className="px-4 py-2.5 text-center"><span className="font-bold text-gray-500" style={{ color: TIER_COLOR[src?.criticality_tier ?? 4] }}>T{src?.criticality_tier}</span></td>
                  <td className="px-4 py-2.5 text-center"><span className="font-bold text-gray-500" style={{ color: TIER_COLOR[tgt?.criticality_tier ?? 4] }}>T{tgt?.criticality_tier}</span></td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                {dependencies.length === 0 ? 'No dependencies defined yet — add one above' : 'No dependencies for selected asset'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Runbook Association Panel ─────────────────────────────────────────────
function RunbookAssociationPanel({ asset, service, runbooks, onClose }: {
  asset?: Asset;
  service?: Service;
  runbooks: Runbook[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<Runbook | null>(null);
  const [eventType, setEventType] = useState('RANSOMWARE');
  const [linked, setLinked] = useState<Set<string>>(new Set());

  const EVENT_TYPES = ['RANSOMWARE','DDoS','DATA_EXFILTRATION','INFRASTRUCTURE_FAILURE','DATABASE_CORRUPTION','NETWORK_DISRUPTION','DR_ACTIVATION','MAJOR_INCIDENT'];

  const filtered = runbooks.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.source_ref.toLowerCase().includes(search.toLowerCase())
  );

  // Tag a runbook with event type and asset/service tags
  const tagMutation = useMutation({
    mutationFn: (runbookId: string) => api.patch(`/runbooks/${runbookId}/tags`, {
      eventTags: [eventType],
      serviceTags: service ? [service.name] : asset ? [asset.name] : [],
    }),
    onSuccess: (_, runbookId) => {
      setLinked(prev => new Set([...prev, runbookId]));
      toast.success('Runbook linked');
      qc.invalidateQueries({ queryKey: ['runbooks'] });
    },
    onError: () => toast.error('Failed to link runbook'),
  });

  const name = asset?.name ?? service?.name ?? 'Component';

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-purple-500" />
          <div>
            <p className="text-sm font-semibold text-white">Runbook association</p>
            <p className="text-xs text-gray-400">{name} · {runbooks.length} available</p>
          </div>
        </div>
        <button onClick={onClose}><X size={15} className="text-gray-400 hover:text-gray-600" /></button>
      </div>

      <div className="px-4 py-3 bg-dark-800 border-b border-gray-700 space-y-2 shrink-0">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Event type to associate</label>
            <select value={eventType} onChange={e => setEventType(e.target.value)} className="w-full text-xs border border-gray-600 rounded-lg px-2 py-1.5 bg-dark-900 bg-opacity-50 focus:outline-none">
              {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-400">Select runbooks to associate with this {asset ? 'component' : 'service'} for {eventType.replace(/_/g, ' ')} recovery. These will be used by the SOE generator when this component is affected.</p>
      </div>

      <div className="px-4 py-2 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2 bg-dark-800 rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search runbooks…" className="text-xs bg-transparent focus:outline-none flex-1" />
        </div>
      </div>

      <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-xs">
            {runbooks.length === 0 ? 'No runbooks ingested yet' : 'No matches'}
          </div>
        ) : filtered.map(r => {
          const isLinked = linked.has(r.id) || (r.event_tags || []).includes(eventType);
          return (
            <div key={r.id} className={clsx('px-4 py-3 hover:bg-dark-800 transition-colors', isLinked && 'bg-dark-800/50')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {isLinked && <CheckCircle2 size={12} className="text-green-500 shrink-0" />}
                    <p className="text-xs font-medium text-white truncate">{r.title}</p>
                  </div>
                  <p className="text-[10px] text-gray-400 font-mono truncate">{r.source_ref}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {(r.event_tags || []).map(t => (
                      <span key={t} className={clsx('text-[10px] px-1.5 py-0.5 rounded', t === eventType ? 'bg-blue-100 text-blue-800 font-medium' : 'bg-dark-700 text-gray-500')}>{t}</span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setPreview(r)} className="p-1.5 hover:bg-dark-700 rounded text-gray-400"><Eye size={12} /></button>
                  <button
                    onClick={() => tagMutation.mutate(r.id)}
                    disabled={isLinked || tagMutation.isPending}
                    className={clsx('text-[10px] font-medium px-2 py-1.5 rounded-lg transition-colors', isLinked ? 'bg-green-100 text-green-700 cursor-default' : 'bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50')}
                  >
                    {isLinked ? 'Linked ✓' : 'Link'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {preview && (
        <div style={{ minHeight: 400, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="fixed inset-0 z-50" onClick={() => setPreview(null)}>
          <div className="bg-dark-900 bg-opacity-50 rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
              <p className="font-semibold text-white text-sm">{preview.title}</p>
              <button onClick={() => setPreview(null)}><X size={15} className="text-gray-400" /></button>
            </div>
            <div className="px-5 py-4 overflow-y-auto flex-1">
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">{preview.content_text?.slice(0, 3000)}{(preview.content_text?.length ?? 0) > 3000 ? '\n…[truncated]' : ''}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Business Service Detail Panel ─────────────────────────────────────────
function ServiceDetailPanel({ service, assets, runbooks, allAssets }: { service: Service; assets: Asset[]; runbooks: Runbook[]; allAssets: Asset[]; }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showRunbooks, setShowRunbooks] = useState(false);

  const linkMutation = useMutation({
    mutationFn: (assetId: string) => api.post(`/business-services/${service.id}/assets`, { assetId }),
    onSuccess: () => { toast.success('Asset linked'); qc.invalidateQueries({ queryKey: ['service-assets', service.id] }); qc.invalidateQueries({ queryKey: ['business-services'] }); },
    onError: () => toast.error('Failed to link'),
  });

  const unlinkMutation = useMutation({
    mutationFn: (assetId: string) => api.delete(`/business-services/${service.id}/assets/${assetId}`),
    onSuccess: () => { toast.success('Asset unlinked'); qc.invalidateQueries({ queryKey: ['service-assets', service.id] }); },
  });

  const unlinkedAssets = allAssets.filter(a => !assets.find(sa => sa.id === a.id));

  const serviceRunbooks = runbooks.filter(r => (r.event_tags || []).length > 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Service header */}
        <div className="bg-gradient-to-br from-brand-50 to-blue-50 border border-brand-100 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: TIER_COLOR[service.impact_tier] + '20', color: TIER_COLOR[service.impact_tier] }}>T{service.impact_tier}</span>
                <span className="w-2 h-2 rounded-full" style={{ background: STATUS_DOT[service.status] }} />
                <span className="text-xs text-gray-500">{service.status}</span>
              </div>
              <h3 className="font-bold text-white">{service.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{service.business_unit}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-brand-700">{service.rto_minutes >= 60 ? `${Math.round(service.rto_minutes/60*10)/10}h` : `${service.rto_minutes}m`}</p>
              <p className="text-[10px] text-gray-400">RTO target</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/events/new')}
            className="mt-3 w-full flex items-center justify-center gap-2 text-xs font-medium bg-brand-600 text-white py-2 rounded-lg hover:bg-brand-700"
          >
            <Zap size={12} /> Open Recovery Event for this Service
          </button>
        </div>

        {/* Component assets */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Component assets ({assets.length})</p>
          </div>
          <div className="space-y-1.5">
            {assets.map(a => (
              <div key={a.id} className="flex items-center gap-2 bg-dark-900 bg-opacity-50 border border-gray-700 rounded-lg px-3 py-2 group">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_DOT[a.status] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate">{a.name}</p>
                  <p className="text-[10px] text-gray-400">{a.asset_type} · T{a.criticality_tier}</p>
                </div>
                <button onClick={() => unlinkMutation.mutate(a.id)} className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-400 transition-all"><X size={11} /></button>
              </div>
            ))}
            {assets.length === 0 && <p className="text-xs text-gray-400 py-2 text-center">No assets linked yet</p>}
          </div>

          {unlinkedAssets.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] text-gray-400 mb-1">Add asset:</p>
              <div className="flex flex-wrap gap-1">
                {unlinkedAssets.slice(0, 8).map(a => (
                  <button key={a.id} onClick={() => linkMutation.mutate(a.id)} className="text-[10px] bg-dark-700 text-gray-600 hover:bg-brand-100 hover:text-brand-700 px-2 py-1 rounded-full transition-colors">
                    + {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Runbook associations */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Recovery runbooks ({serviceRunbooks.length})</p>
            <button onClick={() => setShowRunbooks(s => !s)} className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
              <Link size={11} /> Associate
            </button>
          </div>
          {serviceRunbooks.length === 0 ? (
            <div className="bg-dark-800 border border-amber-200 rounded-lg px-3 py-2.5">
              <p className="text-xs text-amber-700 font-medium">No runbooks linked</p>
              <p className="text-[10px] text-amber-600 mt-0.5">Associate runbooks to enable AI-powered SOE generation for this service</p>
            </div>
          ) : serviceRunbooks.slice(0, 4).map(r => (
            <div key={r.id} className="flex items-center gap-2 bg-dark-900 bg-opacity-50 border border-gray-700 rounded-lg px-3 py-2 mb-1.5">
              <FileText size={12} className="text-purple-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-100 truncate">{r.title}</p>
                <div className="flex gap-1 mt-0.5">{(r.event_tags || []).slice(0, 2).map(t => <span key={t} className="text-[9px] bg-dark-800 text-blue-700 px-1 py-0.5 rounded">{t}</span>)}</div>
              </div>
            </div>
          ))}
        </div>

        {showRunbooks && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setShowRunbooks(false)}>
            <div className="bg-dark-900 bg-opacity-50 rounded-2xl shadow-2xl w-full max-w-md mx-4 h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <RunbookAssociationPanel service={service} runbooks={runbooks} onClose={() => setShowRunbooks(false)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Asset Detail Panel ─────────────────────────────────────────────────────
function AssetDetailPanel({ asset, dependencies, assets, runbooks }: { asset: Asset; dependencies: Dependency[]; assets: Asset[]; runbooks: Runbook[]; }) {
  const [showRunbooks, setShowRunbooks] = useState(false);
  const assetMap = new Map(assets.map(a => [a.id, a]));
  const downstreamDeps = dependencies.filter(d => d.source === asset.id);
  const upstreamDeps = dependencies.filter(d => d.target === asset.id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="bg-dark-900 bg-opacity-50 border border-gray-600 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: STATUS_DOT[asset.status] }} />
            <h3 className="font-bold text-white">{asset.name}</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[['Type', asset.asset_type], ['Env', asset.environment], ['Tier', `T${asset.criticality_tier}`], ['Owner', asset.owner || '—'], ['Status', asset.status]].map(([k, v]) => (
              <div key={k as string}><span className="text-gray-400">{k}</span><p className="font-medium text-gray-100 mt-0.5">{v}</p></div>
            ))}
          </div>
        </div>

        {upstreamDeps.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Depends on ({upstreamDeps.length})</p>
            <div className="space-y-1">
              {upstreamDeps.map((d, i) => {
                const src = assetMap.get(d.source);
                return <div key={i} className="flex items-center gap-2 text-xs bg-dark-800 rounded-lg px-3 py-2">
                  <ArrowRight size={11} className="text-gray-300 rotate-180" />
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_DOT[src?.status ?? 'UNKNOWN'] }} />
                  <span className="font-medium flex-1 truncate">{src?.name}</span>
                  <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{d.relationship_type}</span>
                </div>;
              })}
            </div>
          </div>
        )}

        {downstreamDeps.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Depended on by ({downstreamDeps.length})</p>
            <div className="space-y-1">
              {downstreamDeps.map((d, i) => {
                const tgt = assetMap.get(d.target);
                return <div key={i} className="flex items-center gap-2 text-xs bg-dark-800 rounded-lg px-3 py-2">
                  <ArrowRight size={11} className="text-gray-300" />
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_DOT[tgt?.status ?? 'UNKNOWN'] }} />
                  <span className="font-medium flex-1 truncate">{tgt?.name}</span>
                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded">{d.relationship_type}</span>
                </div>;
              })}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recovery runbooks</p>
            <button onClick={() => setShowRunbooks(true)} className="text-xs text-brand-600 flex items-center gap-1"><Link size={11} /> Associate</button>
          </div>
          {runbooks.length === 0 ? (
            <div className="bg-dark-800 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700">No runbooks linked to this component</p>
            </div>
          ) : runbooks.slice(0, 3).map(r => (
            <div key={r.id} className="flex items-center gap-2 bg-dark-900 bg-opacity-50 border border-gray-700 rounded-lg px-3 py-2 mb-1.5">
              <FileText size={11} className="text-purple-400 shrink-0" />
              <p className="text-xs text-gray-300 truncate">{r.title}</p>
            </div>
          ))}
        </div>

        {showRunbooks && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={() => setShowRunbooks(false)}>
            <div className="bg-dark-900 bg-opacity-50 rounded-2xl shadow-2xl w-full max-w-md mx-4 h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <RunbookAssociationPanel asset={asset} runbooks={runbooks} onClose={() => setShowRunbooks(false)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export function DependencyMappingPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<'graph' | 'table'>('graph');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: assetsData, isLoading: assetsLoading } = useQuery({ queryKey: ['assets'], queryFn: () => assetsApi.list().then(r => r.data.data), refetchInterval: 30_000 });
  const { data: servicesData } = useQuery({ queryKey: ['business-services'], queryFn: () => servicesApi.list().then(r => r.data.data), refetchInterval: 30_000 });
  const { data: depsData, isLoading: depsLoading } = useQuery({ queryKey: ['dependencies'], queryFn: () => api.get('/assets/dependencies').then(r => r.data.data), refetchInterval: 30_000 });
  const { data: runbooksData } = useQuery({ queryKey: ['runbooks'], queryFn: () => api.get('/runbooks').then(r => r.data.data) });
  const { data: serviceAssetsData } = useQuery({
    queryKey: ['service-assets', selectedServiceId],
    queryFn: () => api.get(`/business-services/${selectedServiceId}/assets`).then(r => r.data.data),
    enabled: !!selectedServiceId,
  });

  const assets: Asset[] = (assetsData as Asset[]) ?? [];
  const services: Service[] = (servicesData as Service[]) ?? [];
  const dependencies: Dependency[] = (depsData as Dependency[]) ?? [];
  const runbooks: Runbook[] = (runbooksData as Runbook[]) ?? [];
  const serviceAssets: Asset[] = (serviceAssetsData as Asset[]) ?? [];

  const selectedAsset = assets.find(a => a.id === selectedAssetId);
  const selectedService = services.find(s => s.id === selectedServiceId);

  const filteredAssets = search ? assets.filter(a => a.name.toLowerCase().includes(search.toLowerCase()) || a.asset_type.toLowerCase().includes(search.toLowerCase())) : assets;

  const handleAssetSelect = (id: string | null) => {
    setSelectedAssetId(id);
    setSelectedServiceId(null);
  };
  const handleServiceSelect = (id: string) => {
    setSelectedServiceId(id);
    setSelectedAssetId(null);
  };

  return (
    <div className="h-[calc(100vh-48px)] flex flex-col max-w-full -m-6">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-600 bg-dark-900 bg-opacity-50 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Application Dependency Mapping</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {assets.length} components · {dependencies.length} dependencies · {services.length} business services · {runbooks.length} runbooks
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1 bg-dark-700 rounded-lg p-1">
            <button onClick={() => setView('graph')} className={clsx('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors', view === 'graph' ? 'bg-dark-900 bg-opacity-50 shadow-sm text-white font-medium' : 'text-gray-500 hover:text-gray-300')}>
              <Network size={13} /> Graph
            </button>
            <button onClick={() => setView('table')} className={clsx('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors', view === 'table' ? 'bg-dark-900 bg-opacity-50 shadow-sm text-white font-medium' : 'text-gray-500 hover:text-gray-300')}>
              <Table size={13} /> Table
            </button>
          </div>
          <button onClick={() => navigate('/assets')} className="text-xs border border-gray-600 px-3 py-2 rounded-lg hover:bg-dark-800 flex items-center gap-1.5 text-gray-600">
            <Plus size={13} /> Add Component
          </button>
          <button onClick={() => navigate('/connectors')} className="text-xs border border-gray-600 px-3 py-2 rounded-lg hover:bg-dark-800 flex items-center gap-1.5 text-gray-600">
            <BookOpen size={13} /> Runbooks
          </button>
          <button onClick={() => navigate('/events/new')} className="text-xs bg-brand-600 text-white px-3 py-2 rounded-lg hover:bg-brand-700 flex items-center gap-1.5">
            <Zap size={13} /> Open Recovery Event
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — Business Services */}
        <div className="w-56 border-r border-gray-600 bg-dark-800 flex flex-col shrink-0">
          <div className="px-3 py-2.5 border-b border-gray-600">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Business Services</p>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {services.map(s => (
              <button
                key={s.id}
                onClick={() => handleServiceSelect(s.id)}
                className={clsx('w-full text-left px-3 py-2.5 border-b border-gray-700 transition-colors hover:bg-dark-900 bg-opacity-50', selectedServiceId === s.id && 'bg-dark-900 bg-opacity-50 border-l-2 border-l-brand-500')}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_DOT[s.status] }} />
                  <span className="text-xs font-medium text-white truncate">{s.name}</span>
                </div>
                <p className="text-[10px] text-gray-400 ml-3">{s.business_unit} · T{s.impact_tier}</p>
                <p className="text-[10px] text-gray-400 ml-3">RTO: {s.rto_minutes >= 60 ? `${Math.round(s.rto_minutes/60*10)/10}h` : `${s.rto_minutes}m`}</p>
              </button>
            ))}
            {services.length === 0 && (
              <div className="px-3 py-4 text-center">
                <p className="text-xs text-gray-400 mb-2">No services defined</p>
                <button onClick={() => navigate('/services')} className="text-xs text-brand-600 hover:underline">Add service →</button>
              </div>
            )}
          </div>
          <div className="px-3 py-2.5 border-t border-gray-600 shrink-0">
            <button onClick={() => navigate('/services')} className="w-full text-xs text-center text-brand-600 hover:text-brand-700 py-1.5 flex items-center justify-center gap-1">
              <Plus size={11} /> Manage services
            </button>
          </div>
        </div>

        {/* Main area — Graph or Table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search bar (graph view) */}
          {view === 'graph' && (
            <div className="px-4 py-2 border-b border-gray-700 bg-dark-900 bg-opacity-50 flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2 bg-dark-800 rounded-lg px-3 py-1.5 flex-1 max-w-xs">
                <Search size={13} className="text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter components…" className="text-xs bg-transparent focus:outline-none flex-1" />
              </div>
              {selectedAsset && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="w-2 h-2 rounded-full" style={{ background: STATUS_DOT[selectedAsset.status] }} />
                  <span className="font-medium text-gray-300">{selectedAsset.name}</span>
                  <button onClick={() => handleAssetSelect(null)} className="text-gray-300 hover:text-gray-500"><X size={12} /></button>
                </div>
              )}
              <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
                {[1,2,3,4].map(t => <span key={t} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full inline-block" style={{ background: TIER_COLOR[t] }} />T{t}</span>)}
              </div>
            </div>
          )}

          {view === 'graph' ? (
            <div className="flex-1 overflow-hidden">
              <DependencyGraphCanvas
                assets={filteredAssets}
                dependencies={dependencies}
                selectedId={selectedAssetId}
                onSelect={handleAssetSelect}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <DependencyTable
                assets={assets}
                dependencies={dependencies}
                selectedId={selectedAssetId}
                onSelect={(id) => handleAssetSelect(id || null)}
              />
            </div>
          )}
        </div>

        {/* Right panel — Detail */}
        {(selectedAsset || selectedService) && (
          <div className="w-72 border-l border-gray-600 bg-dark-900 bg-opacity-50 flex flex-col shrink-0 overflow-hidden">
            {selectedService ? (
              <ServiceDetailPanel
                service={selectedService}
                assets={serviceAssets}
                runbooks={runbooks}
                allAssets={assets}
              />
            ) : selectedAsset ? (
              <AssetDetailPanel
                asset={selectedAsset}
                dependencies={dependencies}
                assets={assets}
                runbooks={runbooks}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
