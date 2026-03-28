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
  NOT_STARTED: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Not Started' },
  IN_PROGRESS: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'In Progress' },
  COMPLETED: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
  SKIPPED: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Skipped' },
  BLOCKED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Blocked' },
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
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Recovery Tasks</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg transition-colors"
        >
          <Plus size={14} />
          Add Task
        </button>
      </div>

      {/* Add Task Form */}
      {showAddForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Task Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Verify incident scope"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To</label>
              <input
                type="text"
                value={formData.assigned_to}
                onChange={(e) => setFormData(f => ({ ...f, assigned_to: e.target.value }))}
                placeholder="Assignee name"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder="Task details..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="critical"
                checked={formData.is_on_critical_path}
                onChange={(e) => setFormData(f => ({ ...f, is_on_critical_path: e.target.checked }))}
                className="rounded"
              />
              <label htmlFor="critical" className="text-xs font-medium text-gray-600">Critical Path</label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAddTask}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-sm rounded-lg transition-colors"
            >
              Add Task
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-900 text-sm rounded-lg transition-colors"
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
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-700">Ref</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Description</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Assigned To</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Start</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">End</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Dependencies</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No tasks yet. Click "Add Task" to create one.
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const status = STATUS_BADGE[task.status];
                return (
                  <tr key={task.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">#{task.sequence}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{task.name}</div>
                      {task.description && <div className="text-xs text-gray-500 mt-0.5">{task.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{task.assignee_name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${status.bg} ${status.text}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {task.started_at ? format(new Date(task.started_at), 'MMM dd, HH:mm') : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {task.completed_at ? format(new Date(task.completed_at), 'MMM dd, HH:mm') : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {task.dependencies && task.dependencies.length > 0 ? (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
                          {task.dependencies.length} dep
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onDeleteTask(task.id)}
                        className="p-1 hover:bg-red-50 text-red-600 rounded transition-colors"
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
