/**
 * @file tags.tsx
 * @description P1722 prototype: the draft's tag controls, chips with Remove and the tag field (split from parts.tsx for size).
 */
import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn, extractHashtags } from '@/lib/utils';

/** As the product's tag pills (tag-pills.tsx MAX_TAG_LENGTH): long tags show cut, with the full tag on hover. */
const MAX_TAG_LENGTH = 20;

export function TagChips({ tags, onRemove }: { tags: string[]; onRemove?: (t: string) => void }) {
  if (tags.length === 0) return null;
  const remove = (t: string, i: number, from: HTMLElement) => {
    const scope = from.closest('[data-tag-scope]');
    onRemove?.(t);
    // The clicked chip leaves with its button: focus the Remove now in its place (or the last), else the tag field.
    setTimeout(() => {
      const left = scope?.querySelectorAll<HTMLElement>('button[aria-label^="Remove tag"]');
      (left?.length ? left[Math.min(i, left.length - 1)] : scope?.querySelector<HTMLElement>('input[aria-label="Add a tag"]'))?.focus();
    }, 0);
  };
  return (
    <ul className={cn('flex flex-wrap gap-x-1.5', onRemove ? 'gap-y-5' : 'gap-y-1.5')} aria-label="Tags">
      {tags.map((t, i) => (
        <li key={t} title={t.length > MAX_TAG_LENGTH ? `#${t}` : undefined} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          #{t.length > MAX_TAG_LENGTH ? `${t.slice(0, MAX_TAG_LENGTH)}...` : t}
          {onRemove && (
            <button type="button" aria-label={`Remove tag ${t}`} className="-my-2.5 -mr-2 inline-flex h-10 w-10 items-center justify-center" onClick={e => remove(t, i, e.currentTarget)}>
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** One tag by the product's rule (P1660): `#two words` gives `two`, and text with no tag in it gives nothing. */
const tagOf = (raw: string): string | undefined => extractHashtags(`#${raw.trim().replace(/^#+/, '')}`)[0];

export function TagInput({ onAdd, hintId }: { onAdd: (t: string) => void; hintId: string }) {
  const [v, setV] = useState('');
  const pending = tagOf(v);
  const statusId = useId();
  const add = () => {
    if (pending) onAdd(pending);
    setV('');
  };
  return (
    <div className="flex flex-col gap-1">
    <Input
      value={v}
      onChange={e => setV(e.target.value)}
      onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
      placeholder="Add a tag"
      aria-label="Add a tag"
      aria-describedby={`${hintId} ${statusId}`}
      className="h-10 text-base md:text-sm"
    />
    {/* No blur commit (a chip appearing under the pointer moves the button being clicked), so a typed tag says it is not added yet */}
    <span id={statusId} aria-live="polite" className="text-xs text-muted-foreground">{v.trim() ? (pending ? `Press Enter to add #${pending}` : 'Not a tag you can add: letters and numbers, not a system tag') : null}</span>
    </div>
  );
}
