import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { BookOpen, X, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

interface RunbookViewerProps {
  runbookId?: string;
  citation?: string;
  stepName?: string;
}

export function RunbookViewer({ runbookId, citation, stepName }: RunbookViewerProps) {
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['runbook', runbookId],
    queryFn: () => api.get(`/runbooks/${runbookId}`).then(r => r.data.data),
    enabled: !!runbookId && expanded,
  });

  if (!runbookId && !citation) return null;

  const runbook = data as { title: string; source_ref: string; content_text: string } | undefined;

  // Extract the relevant section if citation is provided
  function extractRelevantSection(content: string, citation: string): string {
    if (!citation) return content.slice(0, 1500);
    const lines = content.split('\n');
    const citationLower = citation.toLowerCase();
    const matchIdx = lines.findIndex(l => l.toLowerCase().includes(citationLower.split(' ')[0]));
    if (matchIdx >= 0) {
      return lines.slice(Math.max(0, matchIdx - 2), matchIdx + 20).join('\n');
    }
    return content.slice(0, 1500);
  }

  return (
    <div className={clsx('rounded-xl border transition-all', expanded ? 'border-purple-200 bg-purple-50/30' : 'border-gray-600 bg-dark-800')}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        <BookOpen size={14} className="text-purple-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-gray-300">Runbook source</span>
          {citation && <span className="text-xs text-gray-400 ml-2 truncate">· {citation}</span>}
        </div>
        {expanded ? <ChevronUp size={13} className="text-gray-400 shrink-0" /> : <ChevronDown size={13} className="text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-purple-100">
          {isLoading ? (
            <div className="flex items-center gap-2 py-3 text-xs text-gray-400">
              <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              Loading runbook…
            </div>
          ) : runbook ? (
            <>
              <div className="flex items-center justify-between py-2">
                <p className="text-xs font-medium text-gray-600">{runbook.title}</p>
                <a href={runbook.source_ref.startsWith('http') ? runbook.source_ref : '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-700">
                  <ExternalLink size={11} /> View source
                </a>
              </div>
              <div className="bg-dark-900 bg-opacity-50 rounded-lg border border-purple-100 px-3 py-2.5 max-h-48 overflow-y-auto">
                <pre className="text-xs text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">
                  {citation ? extractRelevantSection(runbook.content_text, citation) : runbook.content_text?.slice(0, 1500)}
                  {runbook.content_text?.length > 1500 && '\n\n…[view full runbook above]'}
                </pre>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400 py-2">Runbook content not available</p>
          )}
        </div>
      )}
    </div>
  );
}

// Standalone modal version for full runbook view
export function RunbookModal({ runbookId, title, onClose }: { runbookId: string; title?: string; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['runbook', runbookId],
    queryFn: () => api.get(`/runbooks/${runbookId}`).then(r => r.data.data),
  });
  const runbook = data as { title: string; source_ref: string; content_text: string; event_tags: string[] } | undefined;

  const highlighted = search && runbook
    ? runbook.content_text.split(new RegExp(`(${search})`, 'gi')).map((part, i) =>
        part.toLowerCase() === search.toLowerCase()
          ? <mark key={i} className="bg-yellow-200 rounded">{part}</mark>
          : part
      )
    : runbook?.content_text;

  return (
    <div style={{ minHeight: 500, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="fixed inset-0 z-50" onClick={onClose}>
      <div className="bg-dark-900 bg-opacity-50 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-purple-500" />
            <div>
              <p className="font-semibold text-white">{title || runbook?.title || 'Runbook'}</p>
              {runbook && <p className="text-xs text-gray-400 font-mono mt-0.5">{runbook.source_ref}</p>}
            </div>
          </div>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>

        {!isLoading && (
          <div className="px-5 py-2 border-b border-gray-700 shrink-0">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search in runbook…" className="w-full text-sm border border-gray-600 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-purple-400" />
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading runbook content…</div>
          ) : runbook ? (
            <pre className="text-sm text-gray-600 whitespace-pre-wrap font-mono leading-relaxed">{highlighted}</pre>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">Runbook not found</p>
          )}
        </div>

        {runbook?.event_tags?.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-700 shrink-0 flex gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Tags:</span>
            {runbook.event_tags.map(t => <span key={t} className="text-xs bg-dark-800 text-blue-700 px-2 py-0.5 rounded">{t}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}
