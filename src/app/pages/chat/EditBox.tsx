/**
 * @file EditBox.tsx
 * @description P1512: the in-place editor under a message you wrote. Enter saves on a desktop pointer, Escape
 * cancels; a touch keyboard keeps Enter for the new line.
 */
import { Button } from '@/components/ui/button';
import { hasFinePointer } from './chat-hooks';
import { PRIMARY_CLASS } from './chat-kit';

interface Props {
  draft: string;
  saving: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function EditBox({ draft, saving, error, onChange, onSave, onCancel }: Props) {
  return (
    <div className="mt-1" data-testid="edit-message">
      <textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Edit message"
        rows={2}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && hasFinePointer()) {
            e.preventDefault();
            onSave();
          }
        }}
        className="block w-full resize-none rounded-lg border bg-background px-3 py-2 text-base outline-none focus:border-gray-500 md:text-[15px]"
      />
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
      <div className="mt-1 flex gap-2">
        <Button variant="outline" className="min-h-10" onClick={onCancel}>
          Cancel
        </Button>
        <Button className={PRIMARY_CLASS} disabled={saving} onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  );
}
