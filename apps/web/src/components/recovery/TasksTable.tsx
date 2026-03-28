import { formatDistanceToNow, format } from 'date-fns';
import { Badge } from '../ui/Badge';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import { themeClasses } from '../../lib/themeClasses';

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
  NOT_STARTED: { bg: 'bg-gray-300 dark:bg-gray-700', text: 'text-gray-900 dark:text-gray-300', label: 'Not Started' },
  IN_PROGRESS: { bg: 'bg-purple-600 dark:bg-purple-600', text: 'text-purple-50', label: 'In Progress' },
  COMPLETED: { bg: 'bg-yellow-500 dark:bg-yellow-600', text: 'text-white dark:text-gray-900', label: 'Completed' },
  SKIPPED: { bg: 'bg-gray-400 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-200', label: 'Skipped' },
  BLOCKED: { bg: 'bg-red-600 dark:bg-red-600', text: 'text-red-50', label: 'Blocked' },
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
    <div className={clsx(themeClasses.card, 'border-gray-300 dark:border-gray-700 rounded-xl p-6 shadow-sm dark:shadow-md')}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recovery Tasks</h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className={clsx(themeClasses.button.primary, 'flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg')}
        >
          <Plus size={14} />
          Add Task
        </button>
      </div>

      {/* Add Task Form */}
      {showAddForm && (
        <div className={clsx(themeClasses.bg.secondary, 'border border-gray-300 dark:border-gray-700 rounded-lg p-4 mb-6')}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={clsx(themeClasses.text.secondary, 'block text-xs font-medium mb-1')}>Task Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Verify incident scope"
                className={clsx(themeClasses.input, 'w-full rounded-lg px-3 py-2 text-sm')}
              />
            </div>
            <div>
              <label className={clsx(themeClasses.text.secondary, 'block text-xs font-medium mb-1')}>Assigned To</label>
              <input
                type="text"
                value={formData.assigned_to}
                onChange={(e) => setFormData(f => ({ ...f, assigned_to: e.target.value }))}
                placeholder="Assignee name"
                className={clsx(themeClasses.input, 'w-full rounded-lg px-3 py-2 text-sm')}
              />
            </div>
            <div className="md:col-span-2">
              <label className={clsx(themeClasses.text.secondary, 'block text-xs font-medium mb-1')}>Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder="Task details..."
                className={clsx(themeClasses.input, 'w-full rounded-lg px-3 py-2 text-sm resize-none')}
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="critical"
                checked={formData.is_on_critical_path}
                onChange={(e) => setFormData(f => ({ ...f, is_on_critical_path: e.target.checked }))}
                className="rounded border-gray-300 dark:border-gray-700"
              />
              <label htmlFor="critical" className={clsx(themeClasses.text.secondary, 'text-xs font-medium')}>Critical Path</label>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAddTask}
              className={clsx(themeClasses.button.primary, 'px-3 py-1.5 text-sm rounded-lg')}
            >
              Add Task
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className={clsx(themeClasses.button.secondary, 'px-3 py-1.5 text-sm rounded-lg')}
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
            <tr className={clsx('border-b border-gray-300 dark:border-gray-700', themeClasses.bg.tertiary)}>
              <th className={clsx(themeClasses.text.secondary, 'text-left px-4 py-3 font-medium')}>Ref</th>
              <th className={clsx(themeClasses.text.secondary, 'text-left px-4 py-3 font-medium')}>Description</th>
              <th className={clsx(themeClasses.text.secondary, 'text-left px-4 py-3 font-medium')}>Assigned To</th>
              <th className={clsx(themeClasses.text.secondary, 'text-left px-4 py-3 font-medium')}>Status</th>
              <th className={clsx(themeClasses.text.secondary, 'text-left px-4 py-3 font-medium')}>Start</th>
              <th className={clsx(themeClasses.text.secondary, 'text-left px-4 py-3 font-medium')}>End</th>
              <th className={clsx(themeClasses.text.secondary, 'text-left px-4 py-3 font-medium')}>Dependencies</th>
              <th className={clsx(themeClasses.text.secondary, 'text-left px-4 py-3 font-medium')}>Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={8} className={clsx(themeClasses.text.tertiary, 'px-4 py-8 text-center')}>
                  No tasks yet. Click "Add Task" to create one.
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const status = STATUS_BADGE[task.status];
                return (
                  <tr key={task.id} className={clsx('border-b border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 hover:bg-opacity-50 dark:hover:bg-opacity-50')}>
                    <td className={clsx(themeClasses.text.tertiary, 'px-4 py-3 font-mono text-xs')}>#{task.sequence}</td>
                    <td className="px-4 py-3">
                      <div className={clsx('font-medium', themeClasses.text.primary)}>{task.name}</div>
                      {task.description && <div className={clsx(themeClasses.text.tertiary, 'text-xs mt-0.5')}>{task.description}</div>}
                    </td>
                    <td className={clsx(themeClasses.text.secondary, 'px-4 py-3 text-sm')}>{task.assignee_name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('inline-block px-2 py-0.5 rounded text-xs font-medium', status.bg, status.text)}>
                        {status.label}
                      </span>
                    </td>
                    <td className={clsx(themeClasses.text.primary, 'px-4 py-3 text-xs')}>
                      {task.started_at ? format(new Date(task.started_at), 'MMM dd, HH:mm') : '-'}
                    </td>
                    <td className={clsx(themeClasses.text.primary, 'px-4 py-3 text-xs')}>
                      {task.completed_at ? format(new Date(task.completed_at), 'MMM dd, HH:mm') : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {task.dependencies && task.dependencies.length > 0 ? (
                        <span className={clsx(themeClasses.bg.tertiary, themeClasses.text.secondary, 'px-2 py-1 rounded')}>
                          {task.dependencies.length} dep
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onDeleteTask(task.id)}
                        className="p-1 hover:bg-red-200 dark:hover:bg-red-900 dark:hover:bg-opacity-30 text-red-600 dark:text-red-400 rounded transition-colors"
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
