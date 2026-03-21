export default function KanbanCard({
  item,
  statuses,
  currentColIdx,
  onStatusChange,
  onEdit,
  onDelete,
  onCardClick,
  renderContent,
}) {
  const prevStatus = currentColIdx > 0 ? statuses[currentColIdx - 1] : null;
  const nextStatus = currentColIdx < statuses.length - 1 ? statuses[currentColIdx + 1] : null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
      {/* Card body – clickable if there's a next level */}
      <div
        className={onCardClick ? 'cursor-pointer mb-3' : 'mb-3'}
        onClick={() => onCardClick && onCardClick(item)}
        role={onCardClick ? 'button' : undefined}
        tabIndex={onCardClick ? 0 : undefined}
        onKeyDown={
          onCardClick
            ? (e) => e.key === 'Enter' && onCardClick(item)
            : undefined
        }
      >
        {renderContent(item)}
        {onCardClick && (
          <p className="text-xs text-indigo-400 mt-2">Öffnen →</p>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        {/* Status arrows */}
        <div className="flex gap-1">
          {prevStatus && (
            <button
              onClick={() => onStatusChange(item, prevStatus.key)}
              title={`Zurück zu: ${prevStatus.label}`}
              className="px-2 py-1 text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            >
              ◀
            </button>
          )}
          {nextStatus && (
            <button
              onClick={() => onStatusChange(item, nextStatus.key)}
              title={`Weiter zu: ${nextStatus.label}`}
              className="px-2 py-1 text-xs text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors font-medium"
            >
              ▶
            </button>
          )}
        </div>

        {/* Edit / Delete */}
        <div className="flex gap-1">
          <button
            onClick={() => onEdit(item)}
            title="Bearbeiten"
            className="px-2 py-1 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(item)}
            title="Löschen"
            className="px-2 py-1 text-xs text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}
