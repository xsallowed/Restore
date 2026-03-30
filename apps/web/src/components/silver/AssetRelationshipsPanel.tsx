import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, Trash2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

const RELATIONSHIP_TYPES = [
  'used_by', 'owned_by', 'assigned_device', 'has_access_to',
  'terminates_at', 'depends_on', 'hosts', 'manages',
];

interface Relationship {
  relationship_id: string;
  source_asset_id: string;
  relationship_type: string;
  target_asset_id: string;
  notes?: string;
  created_at: string;
}

export function AssetRelationshipsPanel({ assetId }: { assetId: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [newRel, setNewRel] = useState({ relationship_type: 'used_by', target_asset_id: '', notes: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['asset-relationships', assetId],
    queryFn: () => api.get(`/api/v1/relationships?asset_id=${assetId}`).then((r) => r.data.data || []),
  });
  const relationships: Relationship[] = data || [];

  const addMutation = useMutation({
    mutationFn: () => api.post('/api/v1/relationships', { source_asset_id: assetId, ...newRel }),
    onSuccess: () => {
      toast.success('Relationship added');
      queryClient.invalidateQueries({ queryKey: ['asset-relationships', assetId] });
      setShowAdd(false);
      setNewRel({ relationship_type: 'used_by', target_asset_id: '', notes: '' });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to add relationship'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/relationships/${id}`),
    onSuccess: () => { toast.success('Relationship removed'); queryClient.invalidateQueries({ queryKey: ['asset-relationships', assetId] }); },
  });

  const outgoing = relationships.filter((r) => r.source_asset_id === assetId);
  const incoming = relationships.filter((r) => r.target_asset_id === assetId);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className={clsx('text-sm', themeClasses.text.secondary)}>
          {relationships.length} relationship{relationships.length !== 1 ? 's' : ''} linked to this asset
        </p>
        <button onClick={() => setShowAdd(!showAdd)}
          className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded text-sm', themeClasses.button.secondary)}>
          <Plus size={14} /> Add Relationship
        </button>
      </div>

      {showAdd && (
        <div className={clsx('rounded-lg p-4 border space-y-3', themeClasses.bg.secondary, themeClasses.border.primary)}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={clsx('block text-xs font-medium mb-1', themeClasses.text.secondary)}>Relationship Type</label>
              <select value={newRel.relationship_type} onChange={(e) => setNewRel({ ...newRel, relationship_type: e.target.value })}
                className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.primary, themeClasses.border.primary, themeClasses.text.primary)}>
                {RELATIONSHIP_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={clsx('block text-xs font-medium mb-1', themeClasses.text.secondary)}>Target Asset ID</label>
              <input value={newRel.target_asset_id} onChange={(e) => setNewRel({ ...newRel, target_asset_id: e.target.value })}
                placeholder="ASSET-..."
                className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.primary, themeClasses.border.primary, themeClasses.text.primary)} />
            </div>
          </div>
          <div>
            <label className={clsx('block text-xs font-medium mb-1', themeClasses.text.secondary)}>Notes (optional)</label>
            <input value={newRel.notes} onChange={(e) => setNewRel({ ...newRel, notes: e.target.value })}
              className={clsx('w-full px-3 py-2 rounded border text-sm', themeClasses.bg.primary, themeClasses.border.primary, themeClasses.text.primary)} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className={clsx('px-3 py-1.5 rounded text-sm', themeClasses.button.secondary)}>Cancel</button>
            <button onClick={() => addMutation.mutate()} disabled={!newRel.target_asset_id || addMutation.isPending}
              className={clsx('px-3 py-1.5 rounded text-sm text-white', themeClasses.button.primary, 'disabled:opacity-50')}>
              Add
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className={clsx('text-sm', themeClasses.text.secondary)}>Loading…</p>
      ) : relationships.length === 0 ? (
        <div className={clsx('text-center py-8 rounded-lg border border-dashed', themeClasses.border.primary)}>
          <Link2 size={24} className={clsx('mx-auto mb-2 opacity-30', themeClasses.text.secondary)} />
          <p className={clsx('text-sm', themeClasses.text.secondary)}>No relationships yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {outgoing.length > 0 && (
            <div>
              <p className={clsx('text-xs font-medium uppercase tracking-wide mb-2', themeClasses.text.secondary)}>This asset</p>
              <div className="space-y-2">
                {outgoing.map((r) => (
                  <div key={r.relationship_id} className={clsx('flex items-center gap-3 px-4 py-3 rounded-lg border', themeClasses.bg.secondary, themeClasses.border.primary)}>
                    <Link2 size={14} className={clsx(themeClasses.text.secondary)} />
                    <div className="flex-1">
                      <span className={clsx('text-sm', themeClasses.text.primary)}>
                        <span className="font-medium">{r.relationship_type}</span>
                        {' → '}
                        <button onClick={() => navigate(`/assets/${r.target_asset_id}`)}
                          className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-xs">
                          {r.target_asset_id}
                        </button>
                      </span>
                      {r.notes && <p className={clsx('text-xs mt-0.5', themeClasses.text.secondary)}>{r.notes}</p>}
                    </div>
                    <button onClick={() => deleteMutation.mutate(r.relationship_id)}
                      className="text-red-400 hover:text-red-600">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {incoming.length > 0 && (
            <div>
              <p className={clsx('text-xs font-medium uppercase tracking-wide mb-2', themeClasses.text.secondary)}>Referenced by</p>
              <div className="space-y-2">
                {incoming.map((r) => (
                  <div key={r.relationship_id} className={clsx('flex items-center gap-3 px-4 py-3 rounded-lg border', themeClasses.bg.secondary, themeClasses.border.primary)}>
                    <Link2 size={14} className={clsx(themeClasses.text.secondary, 'rotate-180')} />
                    <span className={clsx('text-sm flex-1', themeClasses.text.primary)}>
                      <button onClick={() => navigate(`/assets/${r.source_asset_id}`)}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-xs">
                        {r.source_asset_id}
                      </button>
                      {' '}
                      <span className="font-medium">{r.relationship_type}</span> this asset
                    </span>
                    <ExternalLink size={12} className={clsx(themeClasses.text.secondary)} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
