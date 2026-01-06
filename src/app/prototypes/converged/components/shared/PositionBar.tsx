interface PositionBarProps {
  agree: number;
  disagree: number;
  unsure: number;
  showLabels?: boolean;
  size?: 'sm' | 'md';
}

export function PositionBar({ agree, disagree, unsure, showLabels = true, size = 'md' }: PositionBarProps) {
  const total = agree + disagree + unsure;
  if (total === 0) return null;

  const agreePercent = (agree / total) * 100;
  const disagreePercent = (disagree / total) * 100;
  const unsurePercent = (unsure / total) * 100;

  const barHeight = size === 'sm' ? 'h-2' : 'h-3';

  return (
    <div className="space-y-2">
      {/* Bar */}
      <div className={`flex ${barHeight} rounded-full overflow-hidden bg-gray-200`}>
        {agreePercent > 0 && (
          <div
            className="bg-emerald-500 transition-all duration-300"
            style={{ width: `${agreePercent}%` }}
          />
        )}
        {disagreePercent > 0 && (
          <div
            className="bg-red-500 transition-all duration-300"
            style={{ width: `${disagreePercent}%` }}
          />
        )}
        {unsurePercent > 0 && (
          <div
            className="bg-gray-400 transition-all duration-300"
            style={{ width: `${unsurePercent}%` }}
          />
        )}
      </div>

      {/* Labels */}
      {showLabels && (
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Agree ({agree})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>Disagree ({disagree})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-400" />
            <span>Unsure ({unsure})</span>
          </div>
        </div>
      )}
    </div>
  );
}
