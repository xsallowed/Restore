import clsx from 'clsx';
import { themeClasses } from '../../../lib/themeClasses';

interface ProgressWidgetProps {
  stepsCompleted: number;
  stepsTotal: number;
  stepsInProgress: number;
  estimatedMinutes: number;
  elapsedMinutes: number;
}

export function ProgressWidget({
  stepsCompleted,
  stepsTotal,
  stepsInProgress,
  estimatedMinutes,
  elapsedMinutes,
}: ProgressWidgetProps) {
  const progressPercent = Math.min(100, (stepsCompleted / stepsTotal) * 100);
  const estimatedHours = Math.floor(estimatedMinutes / 60);
  const estimatedMins = estimatedMinutes % 60;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  const elapsedMins = elapsedMinutes % 60;

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className={clsx(themeClasses.text.secondary, 'text-sm font-medium')}>Recovery Progress</span>
          <span className="text-sm font-semibold text-orange">{Math.round(progressPercent)}%</span>
        </div>
        <div className={clsx(themeClasses.bg.tertiary, 'w-full h-2 rounded-full overflow-hidden')}>
          <div
            className="h-full bg-gradient-purple-orange transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className={clsx(themeClasses.bg.tertiary, 'p-3 rounded-lg')}>
          <p className={clsx(themeClasses.text.tertiary, 'text-xs')}>Steps Completed</p>
          <p className={clsx(themeClasses.text.primary, 'text-lg font-bold mt-1')}>{stepsCompleted}/{stepsTotal}</p>
        </div>
        <div className={clsx(themeClasses.bg.tertiary, 'p-3 rounded-lg')}>
          <p className={clsx(themeClasses.text.tertiary, 'text-xs')}>In Progress</p>
          <p className={clsx(themeClasses.text.primary, 'text-lg font-bold mt-1')}>{stepsInProgress}</p>
        </div>
        <div className={clsx(themeClasses.bg.tertiary, 'p-3 rounded-lg')}>
          <p className={clsx(themeClasses.text.tertiary, 'text-xs')}>Est. Time</p>
          <p className={clsx(themeClasses.text.primary, 'text-lg font-bold mt-1')}>{estimatedHours}h {estimatedMins}m</p>
        </div>
        <div className={clsx(themeClasses.bg.tertiary, 'p-3 rounded-lg')}>
          <p className={clsx(themeClasses.text.tertiary, 'text-xs')}>Elapsed</p>
          <p className={clsx(themeClasses.text.primary, 'text-lg font-bold mt-1')}>{elapsedHours}h {elapsedMins}m</p>
        </div>
      </div>
    </div>
  );
}
