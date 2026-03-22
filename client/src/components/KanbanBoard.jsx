import { useState } from 'react';
import KanbanCard from './KanbanCard';

const GRID_COLS = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-5' };

const COLUMN_STYLES = {
  new: {
    wrapper: 'bg-blue-50 border-blue-200',
    title: 'text-blue-800',
    count: 'bg-blue-100 text-blue-700',
    tab: 'border-blue-500 text-blue-600',
  },
  'in-planning': {
    wrapper: 'bg-sky-50 border-sky-200',
    title: 'text-sky-800',
    count: 'bg-sky-100 text-sky-700',
    tab: 'border-sky-500 text-sky-600',
  },
  planned: {
    wrapper: 'bg-violet-50 border-violet-200',
    title: 'text-violet-800',
    count: 'bg-violet-100 text-violet-700',
    tab: 'border-violet-500 text-violet-600',
  },
  'in-implementation': {
    wrapper: 'bg-amber-50 border-amber-200',
    title: 'text-amber-800',
    count: 'bg-amber-100 text-amber-700',
    tab: 'border-amber-500 text-amber-600',
  },
  refined: {
    wrapper: 'bg-violet-50 border-violet-200',
    title: 'text-violet-800',
    count: 'bg-violet-100 text-violet-700',
    tab: 'border-violet-500 text-violet-600',
  },
  in_progress: {
    wrapper: 'bg-amber-50 border-amber-200',
    title: 'text-amber-800',
    count: 'bg-amber-100 text-amber-700',
    tab: 'border-amber-500 text-amber-600',
  },
  implemented: {
    wrapper: 'bg-green-50 border-green-200',
    title: 'text-green-800',
    count: 'bg-green-100 text-green-700',
    tab: 'border-green-500 text-green-600',
  },
  done: {
    wrapper: 'bg-green-50 border-green-200',
    title: 'text-green-800',
    count: 'bg-green-100 text-green-700',
    tab: 'border-green-500 text-green-600',
  },
  closed: {
    wrapper: 'bg-gray-100 border-gray-300',
    title: 'text-gray-600',
    count: 'bg-gray-200 text-gray-600',
    tab: 'border-gray-500 text-gray-600',
  },
};

const DEFAULT_STYLE = COLUMN_STYLES.new;

export default function KanbanBoard({
  items,
  statuses,
  onStatusChange,
  onEdit,
  onDelete,
  onCardClick,
  renderCardContent,
}) {
  const [activeTab, setActiveTab] = useState(0);

  const renderColumn = (col, colIdx) => {
    const colItems = items.filter((i) => i.status === col.key);
    const style = COLUMN_STYLES[col.key] ?? DEFAULT_STYLE;

    return (
      <div key={col.key} className="flex flex-col gap-3">
        <div
          className={`flex items-center justify-between px-4 py-3 rounded-lg border-2 ${style.wrapper}`}
        >
          <h3 className={`font-semibold text-sm uppercase tracking-wider ${style.title}`}>
            {col.label}
          </h3>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.count}`}
          >
            {colItems.length}
          </span>
        </div>

        <div className="flex flex-col gap-3 min-h-[80px]">
          {colItems.map((item) => (
            <KanbanCard
              key={item.id}
              item={item}
              statuses={statuses}
              currentColIdx={colIdx}
              onStatusChange={onStatusChange}
              onEdit={onEdit}
              onDelete={onDelete}
              onCardClick={onCardClick}
              renderContent={renderCardContent}
            />
          ))}
          {colItems.length === 0 && (
            <div className="border-2 border-dashed border-gray-200 rounded-lg h-16 flex items-center justify-center">
              <span className="text-gray-300 text-xs">Leer</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Mobile: Tab navigation */}
      <div className="md:hidden flex border-b border-gray-200 mb-4">
        {statuses.map((col, idx) => {
          const count = items.filter((i) => i.status === col.key).length;
          const isActive = activeTab === idx;
          return (
            <button
              key={col.key}
              onClick={() => setActiveTab(idx)}
              className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? (COLUMN_STYLES[col.key] ?? DEFAULT_STYLE).tab
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {col.label}
              <span className="ml-1 text-xs opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Mobile: Active column only */}
      <div className="md:hidden">
        {renderColumn(statuses[activeTab], activeTab)}
      </div>

      {/* Desktop: All columns */}
      <div className={`hidden md:grid ${GRID_COLS[statuses.length] ?? 'md:grid-cols-3'} gap-5`}>
        {statuses.map((col, colIdx) => renderColumn(col, colIdx))}
      </div>
    </div>
  );
}
