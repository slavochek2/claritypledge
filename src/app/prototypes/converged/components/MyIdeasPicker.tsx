import { X } from 'lucide-react';
import { getUserEngagements } from '../data/mock-data';

interface MyIdeasPickerProps {
  onSelect: (ideaId: string) => void;
  onClose: () => void;
}

export function MyIdeasPicker({ onSelect, onClose }: MyIdeasPickerProps) {
  const myIdeas = getUserEngagements('current');

  const formatPosition = (position: string | null) => {
    if (position === 'agree') return { text: 'Agree', color: 'text-emerald-600' };
    if (position === 'disagree') return { text: 'Disagree', color: 'text-red-600' };
    if (position === 'unsure') return { text: 'Unsure', color: 'text-gray-600' };
    return { text: 'No position', color: 'text-gray-400' };
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">My Ideas</h3>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {myIdeas.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No ideas yet</p>
              <p className="text-sm mt-1">Take a position on an idea to get started</p>
            </div>
          ) : (
            myIdeas.map(item => {
              const pos = formatPosition(item.engagement.position);
              return (
                <button
                  key={item.idea.id}
                  onClick={() => onSelect(item.idea.id)}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <p className="text-sm text-gray-900 line-clamp-2">{item.idea.text}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs">
                    <span className={pos.color}>You: {pos.text}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
