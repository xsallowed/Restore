import GridLayout, { Layout } from 'react-grid-layout';
import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { themeClasses } from '../../lib/themeClasses';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './dashboard.css';

interface DashboardWidget {
  id: string;
  title: string;
  component: React.ReactNode;
  minW?: number;
  minH?: number;
}

interface DashboardGridProps {
  widgets: DashboardWidget[];
  eventId: string;
}

export function DashboardGrid({ widgets, eventId }: DashboardGridProps) {
  const [layout, setLayout] = useState<Layout[]>([]);
  const storageKey = `dashboard-layout-${eventId}`;

  // Initialize layout from localStorage or create default
  useEffect(() => {
    const savedLayout = localStorage.getItem(storageKey);
    if (savedLayout) {
      try {
        setLayout(JSON.parse(savedLayout));
      } catch {
        setDefaultLayout();
      }
    } else {
      setDefaultLayout();
    }
  }, [eventId, storageKey]);

  const setDefaultLayout = () => {
    const defaultLayout: Layout[] = widgets.map((widget, idx) => ({
      x: (idx % 2) * 6,
      y: Math.floor(idx / 2) * 4,
      w: 6,
      h: 4,
      i: widget.id,
      minW: widget.minW || 4,
      minH: widget.minH || 3,
    }));
    setLayout(defaultLayout);
  };

  const handleLayoutChange = (newLayout: Layout[]) => {
    setLayout(newLayout);
    // Save to localStorage
    localStorage.setItem(storageKey, JSON.stringify(newLayout));
  };

  const widgetMap = Object.fromEntries(widgets.map(w => [w.id, w]));

  return (
    <div className={clsx(themeClasses.bg.primary, 'min-h-screen')}>
      <GridLayout
        className="dashboard-grid w-full"
        layout={layout}
        onLayoutChange={handleLayoutChange}
        cols={12}
        rowHeight={50}
        width={1400}
        isDraggable={true}
        isResizable={true}
        compactType="vertical"
        preventCollision={false}
        containerPadding={[24, 24]}
        margin={[16, 16]}
      >
        {layout.map(item => (
          <div
            key={item.i}
            className={clsx(
              themeClasses.card,
              'border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden shadow-sm dark:shadow-md',
              'flex flex-col'
            )}
            style={{
              backgroundColor: undefined,
              borderColor: undefined,
            }}
          >
            {/* Widget Header */}
            {widgetMap[item.i] && (
              <>
                <div className={clsx(themeClasses.bg.tertiary, 'px-4 py-3 border-b border-gray-300 dark:border-gray-700 cursor-move hover:opacity-80 transition-opacity')}>
                  <h3 className={clsx(themeClasses.text.primary, 'text-sm font-semibold')}>
                    {widgetMap[item.i].title}
                  </h3>
                  <p className={clsx(themeClasses.text.tertiary, 'text-xs mt-0.5')}>Drag to move • Resize from corner</p>
                </div>
                {/* Widget Content */}
                <div className="flex-1 overflow-auto p-4">
                  {widgetMap[item.i].component}
                </div>
              </>
            )}
          </div>
        ))}
      </GridLayout>
    </div>
  );
}
