import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { assetsApi } from '../../lib/api';
import { api } from '../../lib/api';
import { AlertTriangle, Layers, Search } from 'lucide-react';
import clsx from 'clsx';

const STATUS_COLOR: Record<string, string> = {
  HEALTHY:  '#22c55e', DEGRADED: '#eab308', CRITICAL: '#f97316',
  OFFLINE:  '#ef4444', UNKNOWN:  '#9ca3af',
};
const TIER_RADIUS: Record<number, number> = { 1: 18, 2: 15, 3: 12, 4: 10 };

interface Asset { id: string; name: string; asset_type: string; status: string; criticality_tier: number; business_services: string[] }
interface GraphNode extends Asset { x: number; y: number; vx: number; vy: number; blastRadius?: boolean; }
interface GraphEdge { source: string; target: string; relationship_type: string; }

export function BlastRadiusView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [blastRadiusIds, setBlastRadiusIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const animFrameRef = useRef<number>();
  const nodesRef = useRef<GraphNode[]>([]);

  const { data: assetsData } = useQuery({
    queryKey: ['assets'],
    queryFn: () => assetsApi.list().then(r => r.data.data),
  });

  const { data: depsData } = useQuery({
    queryKey: ['dependencies'],
    queryFn: () => api.get('/assets/dependencies').then(r => r.data.data),
  });

  // Initialise force-directed layout
  useEffect(() => {
    const assets: Asset[] = (assetsData as Asset[]) ?? [];
    if (!assets.length) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;

    const initialNodes: GraphNode[] = assets.map((a, i) => ({
      ...a,
      x: W / 2 + (Math.random() - 0.5) * 300,
      y: H / 2 + (Math.random() - 0.5) * 300,
      vx: 0, vy: 0,
    }));
    setNodes(initialNodes);
    nodesRef.current = initialNodes;

    const deps: GraphEdge[] = (depsData as GraphEdge[]) ?? [];
    setEdges(deps);
  }, [assetsData, depsData]);

  // Force simulation + canvas render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodes.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width  = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;

    const nodeMap = new Map(nodesRef.current.map(n => [n.id, n]));

    function tick() {
      const ns = nodesRef.current;

      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x, dy = ns[j].y - ns[i].y;
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const force = 2000 / (dist * dist);
          const fx = (dx / dist) * force, fy = (dy / dist) * force;
          ns[i].vx -= fx; ns[i].vy -= fy;
          ns[j].vx += fx; ns[j].vy += fy;
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const src = nodeMap.get(edge.source), tgt = nodeMap.get(edge.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x, dy = tgt.y - src.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const force = (dist - 100) * 0.03;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        src.vx += fx; src.vy += fy;
        tgt.vx -= fx; tgt.vy -= fy;
      }

      // Center gravity
      for (const n of ns) {
        n.vx += (W / 2 - n.x) * 0.002;
        n.vy += (H / 2 - n.y) * 0.002;
        n.vx *= 0.85; n.vy *= 0.85;
        n.x = Math.max(20, Math.min(W - 20, n.x + n.vx));
        n.y = Math.max(20, Math.min(H - 20, n.y + n.vy));
      }

      // Draw
      ctx.clearRect(0, 0, W, H);

      // Edges
      for (const edge of edges) {
        const src = nodeMap.get(edge.source), tgt = nodeMap.get(edge.target);
        if (!src || !tgt) continue;
        const isBR = blastRadiusIds.has(edge.source) && blastRadiusIds.has(edge.target);
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = isBR ? '#ef4444' : '#d1d5db';
        ctx.lineWidth = isBR ? 2 : 1;
        ctx.setLineDash(edge.relationship_type === 'REPLICATES_TO' ? [4, 3] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Nodes
      for (const n of ns) {
        const r = TIER_RADIUS[n.criticality_tier] ?? 10;
        const isSelected = n.id === selectedAsset;
        const isBlast = blastRadiusIds.has(n.id);
        const show = !filter || n.name.toLowerCase().includes(filter.toLowerCase());
        if (!show) { ctx.globalAlpha = 0.15; } else { ctx.globalAlpha = 1; }

        // Halo for selected / blast
        if (isSelected || isBlast) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? 'rgba(59,130,246,0.2)' : 'rgba(239,68,68,0.2)';
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = STATUS_COLOR[n.status] ?? '#9ca3af';
        ctx.fill();
        ctx.strokeStyle = isSelected ? '#3b82f6' : '#fff';
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#374151';
        ctx.font = `${Math.max(9, r - 2)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(n.name.length > 12 ? n.name.slice(0, 11) + '…' : n.name, n.x, n.y + r + 11);
        ctx.globalAlpha = 1;
      }

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [nodes, edges, blastRadiusIds, selectedAsset, filter]);

  // Canvas click handler
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    for (const n of nodesRef.current) {
      const r = TIER_RADIUS[n.criticality_tier] ?? 10;
      if (Math.hypot(n.x - mx, n.y - my) <= r) {
        setSelectedAsset(n.id === selectedAsset ? null : n.id);
        if (n.id !== selectedAsset) {
          assetsApi.blastRadius(n.id).then(res => {
            const affected: { id: string }[] = res.data.data.affectedAssets ?? [];
            setBlastRadiusIds(new Set([n.id, ...affected.map(a => a.id)]));
          });
        } else {
          setBlastRadiusIds(new Set());
        }
        return;
      }
    }
    setSelectedAsset(null);
    setBlastRadiusIds(new Set());
  }

  const selectedNode = nodesRef.current.find(n => n.id === selectedAsset);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asset Dependency Graph</h1>
          <p className="text-sm text-gray-500 mt-0.5">Click any asset to reveal its blast radius</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2">
            <Search size={14} className="text-gray-400" />
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter assets…" className="text-sm bg-transparent focus:outline-none w-32" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {/* Graph canvas */}
        <div className="col-span-3 bg-white border border-gray-200 rounded-xl overflow-hidden relative" style={{ height: 520 }}>
          <canvas ref={canvasRef} className="w-full h-full cursor-pointer" onClick={handleCanvasClick} />

          {/* Legend */}
          <div className="absolute bottom-3 left-3 bg-white/90 rounded-lg px-3 py-2 text-xs space-y-1">
            {Object.entries(STATUS_COLOR).map(([s, c]) => (
              <div key={s} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full inline-block" style={{ background: c }} />
                {s}
              </div>
            ))}
          </div>

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
              <div className="text-center">
                <Layers size={32} className="mx-auto mb-2 opacity-30" />
                No assets registered
              </div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="space-y-3">
          {selectedNode ? (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATUS_COLOR[selectedNode.status] }} />
                <span className="font-medium text-sm text-gray-900">{selectedNode.name}</span>
              </div>
              <div className="divide-y divide-gray-50 text-xs">
                {[
                  ['Type', selectedNode.asset_type],
                  ['Status', selectedNode.status],
                  ['Tier', `T${selectedNode.criticality_tier}`],
                  ['Services', (selectedNode.business_services || []).filter(Boolean).join(', ') || '—'],
                ].map(([k, v]) => (
                  <div key={k as string} className="px-4 py-2.5 flex justify-between">
                    <span className="text-gray-400">{k as string}</span>
                    <span className="text-gray-700 font-medium text-right">{v as string}</span>
                  </div>
                ))}
              </div>
              {blastRadiusIds.size > 1 && (
                <div className="px-4 py-3 bg-red-50 border-t border-red-100">
                  <div className="flex items-center gap-1.5 text-red-700 text-xs font-medium mb-1">
                    <AlertTriangle size={12} /> Blast Radius
                  </div>
                  <p className="text-xs text-red-600">{blastRadiusIds.size - 1} downstream assets affected</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-sm text-gray-400">
              Click an asset node to see details and blast radius
            </div>
          )}

          {/* Stats */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-xs space-y-2">
            <p className="font-semibold text-gray-700 text-sm">Asset summary</p>
            {Object.entries(STATUS_COLOR).map(([status, color]) => {
              const count = nodes.filter(n => n.status === status).length;
              if (!count) return null;
              return (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="text-gray-500">{status}</span>
                  </div>
                  <span className="font-medium text-gray-700">{count}</span>
                </div>
              );
            })}
            <div className="pt-1 border-t border-gray-100 flex justify-between">
              <span className="text-gray-400">Total</span>
              <span className="font-semibold">{nodes.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
