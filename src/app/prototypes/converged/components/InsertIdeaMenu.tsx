import { Plus, Lightbulb } from 'lucide-react';

interface InsertIdeaMenuProps {
  onSelectNew: () => void;
  onSelectFromMyIdeas: () => void;
  onClose: () => void;
}

export function InsertIdeaMenu({ onSelectNew, onSelectFromMyIdeas, onClose }: InsertIdeaMenuProps) {
  return (
    <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onSelectNew}
          className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-3"
        >
          <Plus className="w-5 h-5 text-gray-600" />
          <span className="font-medium">New Idea</span>
        </button>

        <button
          onClick={onSelectFromMyIdeas}
          className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-3"
        >
          <Lightbulb className="w-5 h-5 text-gray-600" />
          <span className="font-medium">From My Ideas</span>
        </button>

        <button
          onClick={onClose}
          className="w-full text-center px-4 py-3 rounded-lg hover:bg-gray-50 text-gray-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
