import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { connectorsApi, api } from '../../lib/api';
import toast from 'react-hot-toast';
import { Plus, X, Upload, RefreshCw, BookOpen, Search, FileText, Eye, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';

const CONNECTOR_TYPES = ['GITHUB','CONFLUENCE','HTTP'];
const TYPE_DESC: Record<string, string> = { GITHUB:'GitHub repo — .md/.txt/.yaml runbooks', CONFLUENCE:'Atlassian Confluence — pages via REST API', HTTP:'HTTP/HTTPS — any accessible markdown or text' };

interface Connector { id: string; name: string; connector_type: string; config: Record<string, unknown>; last_synced_at?: string; last_sync_status?: string; is_active: boolean; }
interface Runbook { id: string; title: string; source_ref: string; fetched_at: string; event_tags: string[]; content_text?: string; }

function ConnectorForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState('GITHUB');
  const [name, setName] = useState('');
  const [credRef, setCredRef] = useState('');
  const [ghOwner, setGhOwner] = useState('');
  const [ghRepo, setGhRepo] = useState('');
  const [ghBranch, setGhBranch] = useState('main');
  const [ghPaths, setGhPaths] = useState('');
  const [cfUrl, setCfUrl] = useState('');
  const [cfSpace, setCfSpace] = useState('');
  const [httpUrls, setHttpUrls] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      let config: Record<string, unknown> = {};
      if (type === 'GITHUB') config = { owner: ghOwner, repo: ghRepo, branch: ghBranch, paths: ghPaths ? ghPaths.split(',').map(s => s.trim()) : [] };
      if (type === 'CONFLUENCE') config = { baseUrl: cfUrl, spaceKey: cfSpace };
      if (type === 'HTTP') config = { urls: httpUrls.split('\n').map(s => s.trim()).filter(Boolean) };
      return api.post('/connectors', { name, connectorType: type, config, credentialRef: credRef || null });
    },
    onSuccess: () => { toast.success('Connector added'); onSaved(); onClose(); },
    onError: () => toast.error('Failed to add connector'),
  });

  return (
    <div style={{ minHeight: 540, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="bg-dark-900 bg-opacity-50 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="font-semibold text-white">Add runbook connector</h2>
          <button onClick={onClose}><X size={16} className="text-white" /></button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {CONNECTOR_TYPES.map(t => (
                <button key={t} onClick={() => setType(t)} className={clsx('text-left px-3 py-2.5 rounded-lg border text-sm transition-colors', type === t ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-600 hover:border-gray-300')}>
                  <p className="font-medium text-xs">{t}</p>
                  <p className="text-[10px] text-white mt-0.5 leading-tight">{TYPE_DESC[t]}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Security Runbooks Repo" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          {type === 'GITHUB' && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Owner *</label><input value={ghOwner} onChange={e => setGhOwner(e.target.value)} placeholder="org-name" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Repository *</label><input value={ghRepo} onChange={e => setGhRepo(e.target.value)} placeholder="repo-name" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Branch</label><input value={ghBranch} onChange={e => setGhBranch(e.target.value)} placeholder="main" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Paths (comma-separated)</label><input value={ghPaths} onChange={e => setGhPaths(e.target.value)} placeholder="runbooks, playbooks" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" /></div>
            </div>
          )}
          {type === 'CONFLUENCE' && (
            <div className="space-y-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Base URL *</label><input value={cfUrl} onChange={e => setCfUrl(e.target.value)} placeholder="https://yourorg.atlassian.net/wiki" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Space key *</label><input value={cfSpace} onChange={e => setCfSpace(e.target.value)} placeholder="RUNBOOKS" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" /></div>
            </div>
          )}
          {type === 'HTTP' && (
            <div><label className="block text-xs font-medium text-gray-600 mb-1">URLs (one per line) *</label><textarea value={httpUrls} onChange={e => setHttpUrls(e.target.value)} rows={3} placeholder="https://example.com/runbook.md" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none font-mono" /></div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Credential env var name</label>
            <input value={credRef} onChange={e => setCredRef(e.target.value)} placeholder="e.g. GITHUB_TOKEN" className="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400" />
            <p className="text-xs text-white mt-1">Add this variable to your .env file. Never stored in the database.</p>
          </div>
        </div>
        <div className="px-5 pb-5 pt-3 flex gap-3 border-t border-gray-700">
          <button onClick={onClose} className="flex-1 text-sm border border-gray-600 py-2.5 rounded-lg hover:bg-dark-800">Cancel</button>
          <button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending} className="flex-1 text-sm bg-brand-600 text-white py-2.5 rounded-lg hover:bg-brand-700 disabled:opacity-50">{mutation.isPending ? 'Adding…' : 'Add connector'}</button>
        </div>
      </div>
    </div>
  );
}

function PdfUpload({ onIngested }: { onIngested: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const handleFiles = async (files: FileList) => {
    setUploading(true);
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith('.pdf')) { toast.error(`${file.name}: only PDFs accepted`); continue; }
      setProgress(`Uploading ${file.name}…`);
      const formData = new FormData();
      formData.append('file', file);
      try {
        await api.post('/runbooks/upload-pdf', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        toast.success(`${file.name} ingested`);
        onIngested();
      } catch { toast.error(`Failed: ${file.name}`); }
    }
    setUploading(false); setProgress('');
  };
  return (
    <div className="bg-dark-900 bg-opacity-50 border border-gray-600 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2"><Upload size={14} className="text-purple-500" /><span className="text-sm font-medium text-white">PDF upload (FR1.6)</span></div>
      <div className="p-4">
        <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50 transition-colors"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}>
          <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
          {uploading ? (
            <div><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" /><p className="text-sm text-brand-600">{progress}</p></div>
          ) : (
            <><FileText size={22} className="mx-auto text-gray-300 mb-2" /><p className="text-sm text-gray-300 font-medium">Drop PDFs here or click to browse</p><p className="text-xs text-white mt-1">AI extracts and indexes all procedural content</p></>
          )}
        </div>
      </div>
    </div>
  );
}

export function ConnectorsPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<Runbook | null>(null);

  const { data: connData } = useQuery({ queryKey: ['connectors'], queryFn: () => connectorsApi.list().then(r => r.data.data) });
  const { data: rbData } = useQuery({ queryKey: ['runbooks'], queryFn: () => api.get('/runbooks').then(r => r.data.data), refetchInterval: 30_000 });

  const connectors: Connector[] = (connData as Connector[]) ?? [];
  const runbooks: Runbook[] = (rbData as Runbook[]) ?? [];
  const filtered = runbooks.filter(r => !search || r.title.toLowerCase().includes(search.toLowerCase()) || r.source_ref.toLowerCase().includes(search.toLowerCase()));

  const syncMut = useMutation({ mutationFn: (id: string) => connectorsApi.ingest(id), onSuccess: () => { toast.success('Sync queued'); qc.invalidateQueries({ queryKey: ['connectors'] }); }, onError: () => toast.error('Failed to queue sync') });
  const delMut = useMutation({ mutationFn: (id: string) => api.delete(`/connectors/${id}`), onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['connectors'] }); }, onError: () => toast.error('Failed to delete') });

  const StatusDot = ({ s }: { s?: string }) => s === 'OK' ? <CheckCircle2 size={13} className="text-gold" /> : s === 'ERROR' ? <AlertTriangle size={13} className="text-red-500" /> : s === 'RUNNING' ? <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> : <Clock size={13} className="text-gray-300" />;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-white">Runbook Connectors</h1><p className="text-sm text-gray-300 mt-0.5">Source integrations · FR1</p></div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700"><Plus size={14} /> Add connector</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Configured connectors</h2>
          {connectors.length === 0 ? (
            <div className="bg-dark-800 border border-gray-600 rounded-xl p-6 text-center"><p className="text-sm text-white mb-3">No connectors yet</p><button onClick={() => setShowAdd(true)} className="text-sm bg-brand-600 text-white px-3 py-2 rounded-lg hover:bg-brand-700 inline-flex items-center gap-1.5"><Plus size={13} /> Add connector</button></div>
          ) : connectors.map(c => (
            <div key={c.id} className="bg-dark-900 bg-opacity-50 border border-gray-600 rounded-xl p-4">
              <div className="flex items-center gap-2">
                <StatusDot s={c.last_sync_status} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-white truncate">{c.name}</p>
                  <p className="text-xs text-white">{c.connector_type} · {c.last_synced_at ? formatDistanceToNow(new Date(c.last_synced_at), { addSuffix: true }) : 'Never synced'}</p>
                </div>
                <button onClick={() => syncMut.mutate(c.id)} className="text-xs border border-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-dark-800 text-gray-600 flex items-center gap-1"><RefreshCw size={11} /> Sync</button>
                <button onClick={() => { if (window.confirm(`Delete ${c.name}?`)) delMut.mutate(c.id); }} className="text-xs text-red-400 hover:text-red-600 px-2 py-1.5">✕</button>
              </div>
              {c.last_sync_status === 'ERROR' && <p className="text-xs text-red-500 mt-2 bg-dark-800 px-2 py-1 rounded">Last sync failed — check credentials</p>}
            </div>
          ))}
        </div>
        <PdfUpload onIngested={() => qc.invalidateQueries({ queryKey: ['runbooks'] })} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><BookOpen size={15} className="text-brand-500" /> Runbook library ({runbooks.length})</h2>
          <div className="flex items-center gap-2 bg-dark-900 bg-opacity-50 border border-gray-600 rounded-lg px-3 py-2"><Search size={13} className="text-white" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="text-sm bg-transparent focus:outline-none w-40" /></div>
        </div>
        <div className="bg-dark-900 bg-opacity-50 border border-gray-600 rounded-xl overflow-hidden">
          {filtered.length === 0 ? <div className="py-10 text-center text-sm text-white">{runbooks.length === 0 ? 'No runbooks ingested yet — add a connector or upload a PDF' : 'No matches'}</div> : (
            <table className="w-full text-sm">
              <thead><tr className="bg-dark-800 border-b border-gray-700">{['Title','Source','Tags','Last synced',''].map(h => <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-300 uppercase tracking-wide text-left">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-dark-800">
                    <td className="px-4 py-3 font-medium text-white max-w-xs truncate">{r.title}</td>
                    <td className="px-4 py-3 text-xs text-white font-mono max-w-xs truncate">{r.source_ref}</td>
                    <td className="px-4 py-3"><div className="flex gap-1 flex-wrap">{(r.event_tags||[]).slice(0,2).map(t => <span key={t} className="text-[10px] bg-dark-800 text-blue-700 px-1.5 py-0.5 rounded">{t}</span>)}{(r.event_tags||[]).length===0&&<span className="text-xs text-gray-300">—</span>}</div></td>
                    <td className="px-4 py-3 text-xs text-white">{formatDistanceToNow(new Date(r.fetched_at), { addSuffix: true })}</td>
                    <td className="px-4 py-3"><button onClick={() => setPreview(r)} className="text-xs text-brand-600 flex items-center gap-1"><Eye size={12} /> Preview</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {preview && (
        <div style={{ minHeight: 500, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="fixed inset-0 z-50" onClick={() => setPreview(null)}>
          <div className="bg-dark-900 bg-opacity-50 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
              <div><p className="font-semibold text-white">{preview.title}</p><p className="text-xs text-white font-mono mt-0.5">{preview.source_ref}</p></div>
              <button onClick={() => setPreview(null)}><X size={16} className="text-white" /></button>
            </div>
            <div className="px-5 py-4 overflow-y-auto flex-1"><pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">{preview.content_text?.slice(0, 4000)}{(preview.content_text?.length ?? 0) > 4000 ? '\n\n…[truncated]' : ''}</pre></div>
          </div>
        </div>
      )}

      {showAdd && <div className="fixed inset-0 z-50"><ConnectorForm onClose={() => setShowAdd(false)} onSaved={() => qc.invalidateQueries({ queryKey: ['connectors'] })} /></div>}
    </div>
  );
}
