import { X, Pause, Square, Play, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import clsx from 'clsx';
import toast from 'react-hot-toast';

interface EventDetailsModalProps {
  event: {
    id: string;
    title: string;
    event_type: string;
    severity: 'P1' | 'P2' | 'P3' | 'P4';
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    opened_at: string;
    commander_name?: string;
    notes?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onActivate: () => void;
  onPause?: () => void;
  onSuspend?: () => void;
}

const SEVERITY_LABEL = {
  P1: 'Critical',
  P2: 'High',
  P3: 'Medium',
  P4: 'Low',
};

export function EventDetailsModal({
  event,
  isOpen,
  onClose,
  onActivate,
  onPause,
  onSuspend,
}: EventDetailsModalProps) {
  if (!isOpen) return null;

  const handleActivate = () => {
    onActivate();
    toast.success('Event activated - Recovery operations started');
  };

  const handlePause = () => {
    onPause?.();
    toast.success('Event paused - You can resume recovery later');
  };

  const handleSuspend = () => {
    if (window.confirm('Are you sure you want to suspend this event? All running activities will be stopped.')) {
      onSuspend?.();
      toast.success('Event suspended');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-900 bg-opacity-50 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-red-50 to-orange-50 border-b border-gray-600 px-6 py-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={20} className="text-red-600" />
              <h2 className="text-2xl font-bold text-white">{event.title}</h2>
            </div>
            <p className="text-sm text-gray-600">{event.event_type}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Status Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-dark-800 border border-red-200 rounded-xl p-4">
              <p className="text-xs text-gray-600 mb-1">Severity</p>
              <p className="font-bold text-red-700">{event.severity}</p>
              <p className="text-xs text-gray-300 mt-1">{SEVERITY_LABEL[event.severity]}</p>
            </div>
            <div className="bg-dark-800 border border-blue-200 rounded-xl p-4">
              <p className="text-xs text-gray-600 mb-1">Status</p>
              <p className="font-bold text-blue-700">{event.status}</p>
              <p className="text-xs text-gray-300 mt-1">
                {event.status === 'OPEN' ? 'Awaiting activation' : 'Active'}
              </p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <p className="text-xs text-gray-600 mb-1">Time Open</p>
              <p className="font-bold text-purple-700">
                {Math.round(
                  (Date.now() - new Date(event.opened_at).getTime()) / (1000 * 60)
                )}m
              </p>
              <p className="text-xs text-gray-300 mt-1">{formatDistanceToNow(new Date(event.opened_at))}</p>
            </div>
            <div className="bg-dark-800 border border-green-200 rounded-xl p-4">
              <p className="text-xs text-gray-600 mb-1">Commander</p>
              <p className="font-bold text-green-700">{event.commander_name || '-'}</p>
              <p className="text-xs text-gray-300 mt-1">Incident Lead</p>
            </div>
          </div>

          {/* Event Details */}
          <div className="space-y-4">
            <h3 className="font-semibold text-white">Event Summary</h3>
            {event.notes && (
              <div className="bg-dark-800 border border-gray-600 rounded-lg p-4">
                <p className="text-sm text-gray-300">{event.notes}</p>
              </div>
            )}
            {!event.notes && (
              <div className="bg-dark-800 border border-gray-600 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-300">No additional notes</p>
              </div>
            )}
          </div>

          {/* Risk Assessment */}
          <div className="bg-dark-800 border border-amber-200 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-white">Risk Assessment</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Business Impact</span>
                <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-red-600" style={{ width: '85%' }} />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">Recovery Complexity</span>
                <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500" style={{ width: '72%' }} />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-300">System Affected</span>
                <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-500" style={{ width: '60%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="sticky bottom-0 bg-dark-800 border-t border-gray-600 px-6 py-4 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>

          {event.status === 'OPEN' && (
            <button
              onClick={handleActivate}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
            >
              <Play size={16} />
              Activate Event
            </button>
          )}

          {event.status === 'IN_PROGRESS' && (
            <>
              <button
                onClick={handlePause}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                <Pause size={16} />
                Pause
              </button>
              <button
                onClick={handleSuspend}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                <Square size={16} />
                Suspend
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
