import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, eventsApi } from '../../lib/api';
import { Users, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface Step { id: string; name: string; assignee_name?: string; swim_lane?: string; }

export function StepAssignModal({ step, eventId, onClose, onAssigned }: {
  step: Step;
  eventId: string;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [search, setSearch] = useState('');

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data.data),
  });

  const users: Array<{ id: string; display_name: string; email: string; tier: string }> = (usersData as Array<{ id: string; display_name: string; email: string; tier: string }>) ?? [];
  const filtered = users.filter(u =>
    u.display_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const assignMutation = useMutation({
    mutationFn: (userId: string) => eventsApi.updateStep(eventId, step.id, { assignedTo: userId }),
    onSuccess: () => { toast.success('Step assigned'); onAssigned(); },
    onError: () => toast.error('Failed to assign step'),
  });

  const TIER_BADGE: Record<string, string> = {
    BRONZE: 'bg-amber-100 text-gold',
    SILVER: 'bg-blue-100 text-blue-800',
    GOLD: 'bg-green-100 text-green-800',
    AUTHOR: 'bg-purple-100 text-purple-800',
    ADMIN: 'bg-dark-700 text-gray-300',
  };

  return (
    <div style={{ minHeight: 400, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      className="inset-0 z-50"
      onClick={onClose}
    >
      <div
        className="bg-dark-900 bg-opacity-50 rounded-2xl shadow-2xl w-full max-w-md mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-purple-500" />
            <h2 className="font-semibold text-white text-sm">Assign step</h2>
          </div>
          <button onClick={onClose} className="text-white hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* Step info */}
        <div className="px-5 py-3 bg-dark-800 border-b border-gray-700">
          <p className="text-sm font-medium text-white truncate">{step.name}</p>
          {step.assignee_name && (
            <p className="text-xs text-white mt-0.5">Currently: {step.assignee_name}</p>
          )}
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2 bg-dark-800 rounded-lg px-3 py-2">
            <Search size={14} className="text-white" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users..."
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>
        </div>

        {/* User list */}
        <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="px-5 py-6 text-center text-white text-sm">No users found</div>
          ) : filtered.map(user => (
            <button
              key={user.id}
              onClick={() => assignMutation.mutate(user.id)}
              disabled={assignMutation.isPending}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-dark-800 transition-colors text-left disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-xs shrink-0">
                {user.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{user.display_name}</p>
                <p className="text-xs text-white truncate">{user.email}</p>
              </div>
              <span className={clsx('text-xs px-1.5 py-0.5 rounded shrink-0', TIER_BADGE[user.tier] ?? 'bg-dark-700 text-gray-600')}>
                {user.tier}
              </span>
            </button>
          ))}
        </div>

        {/* Unassign */}
        <div className="px-5 py-3 border-t border-gray-700">
          <button
            onClick={() => assignMutation.mutate('')}
            className="w-full text-xs text-gray-300 hover:text-gray-300 py-1"
          >
            Remove assignment
          </button>
        </div>
      </div>
    </div>
  );
}
