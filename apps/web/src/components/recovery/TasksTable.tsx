import { formatDistanceToNow, format } from 'date-fns';
import { Badge } from '../ui/Badge';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface Task {
  id: string;
  sequence: number;
  name: string;
  description: string;
  assigned_to: string | null;
  assignee_name: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'BLOCKED';
  started_at: string | null;
  completed_at: string | null;
  dependencies: string[];
  is_on_critical_path: boolean;
}

interface TasksTableProps {
  tasks: Task[];
  onAddTask: (task: Omit<Task, 'id'>) => void;
  onDeleteTask: (taskId: string) => void;
}

const STATUS_BADGE = {
  NOT_STARTED: { bg: 'bg-dark-700', text: 'text-dark-200', label: 'Not Started' },
  IN_PROGRESS: { bg: 'bg-purple-600', text: 'text-purple-100', label: 'In Progress' },
  COMPLETED: { bg: 'bg-gold', text: 'text-gray-900', label: 'Completed' },
  SKIPPED: { bg: 'bg-dark-600', text: 'text-gray-200', label: 'Skipped' },
  BLOCKED: { bg: 'bg-red-600', text: 'text-red-100', label: 'Blocked' },
};

export function TasksTable({ tasks, onAddTask, onDeleteTask }: TasksTableProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    assigned_to: '',
    sequence: tasks.length + 1,
    is_on_critical_path: false,
  });

  const handleAddTask = () => {
    if (!formData.name.trim()) return;
    onAddTask({
      ...formData,
      status: 'NOT_STARTED',
      started_at: null,
      completed_at: null,
      dependencies: [],
      assignee_name: formData.assigned_to || null,
    } as Omit<Task, 'id'>);
    setFormData({
      name: '',
      description: '',
      assigned_to: '',
      sequence: tasks.length + 1,
      is_on_critical_path: false,
    });
    setShowAddForm(false);
  };

  return (
    <div className="bg-dark-900 bg-opacity-50 backdrop-blur border border-dark-700 border-opacity-50 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Recovery Tasks</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={14} />
          Add Task
        </button>
      </div>

      {/* Add Task Form */}
      {showAddForm && (
        <div className="bg-dark-800 border border-dark-700 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-dark-300 mb-1">Task Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Verify incident scope"
                className="w-full border border-dark-600 bg-dark-900 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-300 mb-1">Assigned To</label>
              <input
                type="text"
                value={formData.assigned_to}
                onChange={(e) => setFormData(f => ({ ...f, assigned_to: e.target.value }))}
                placeholder="Assignee name"
                className="w-full border border-dark-600 bg-dark-900 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-dark-300 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder="Task details..."
                className="w-full border border-dark-600 bg-dark-900 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="critical"
                checked={formData.is_on_critical_path}
                onChange={(e) => setFormData(f => ({ ...f, is_on_critical_path: e.target.checked }))}
                className="rounded border-dark-600 bg-dark-900"
              />
              <label htmlFor="critical" className="text-xs font-medium text-dark-300">Critical Path</label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAddTask}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg transition-colors"
            >
              Add Task
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-200 text-sm rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tasks Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-700 bg-dark-800">
              <th className="text-left px-4 py-3 font-medium text-dark-300">Ref</th>
              <th className="text-left px-4 py-3 font-medium text-dark-300">Description</th>
              <th className="text-left px-4 py-3 font-medium text-dark-300">Assigned To</th>
              <th className="text-left px-4 py-3 font-medium text-dark-300">Status</th>
              <th className="text-left px-4 py-3 font-medium text-dark-300">Start</th>
              <th className="text-left px-4 py-3 font-medium text-dark-300">End</th>
              <th className="text-left px-4 py-3 font-medium text-dark-300">Dependencies</th>
              <th className="text-left px-4 py-3 font-medium text-dark-300">Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-dark-400">
                  No tasks yet. Click "Add Task" to create one.
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const status = STATUS_BADGE[task.status];
                return (
                  <tr key={task.id} className="border-b border-dark-700 hover:bg-dark-800 hover:bg-opacity-50">
                    <td className="px-4 py-3 font-mono text-xs text-dark-400">#{task.sequence}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{task.name}</div>
                      {task.description && <div className="text-xs text-dark-400 mt-0.5">{task.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-dark-300">{task.assignee_name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${status.bg} ${status.text}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {task.started_at ? format(new Date(task.started_at), 'MMM dd, HH:mm') : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {task.completed_at ? format(new Date(task.completed_at), 'MMM dd, HH:mm') : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {task.dependencies && task.dependencies.length > 0 ? (
                        <span className="px-2 py-1 bg-dark-700 text-dark-200 rounded">
                          {task.dependencies.length} dep
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onDeleteTask(task.id)}
                        className="p-1 hover:bg-red-900 hover:bg-opacity-30 text-red-400 rounded transition-colors"
                        title="Delete task"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
