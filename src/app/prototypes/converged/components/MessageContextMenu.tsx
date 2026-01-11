import { Mic } from 'lucide-react';
import { type Message } from '../data/mock-data';

interface MessageContextMenuProps {
  message: Message;
  isOwn: boolean;
  onVerify: () => void;
  onClose: () => void;
}

export function MessageContextMenu({ onVerify, onClose }: Omit<MessageContextMenuProps, 'message' | 'isOwn'>) {
  return (
    <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl p-4 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => {
            onVerify();
            onClose();
          }}
          className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 flex items-center gap-3"
        >
          <Mic className="w-5 h-5 text-blue-600" />
          <span className="font-medium">
            {isOwn ? 'Did you understand me?' : 'Did I understand you?'}
          </span>
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
