/**
 * @file VisibilityAndSave.tsx
 * @description P425: Visibility selector + save/back actions for the AI story guide flow.
 */
import { Button } from '@/components/ui/button';
import type { StoryVisibility } from '@/app/types';
import { VISIBILITY_OPTIONS } from '@/app/data/story-visibility-options';

interface VisibilityAndSaveProps {
  selectedVisibility: StoryVisibility;
  onVisibilityChange: (v: StoryVisibility) => void;
  onSave: () => void;
  onBack: () => void;
  isSaving: boolean;
  /** When true, visibility is shown as a read-only pill (editing existing story). */
  isEditMode?: boolean;
}

function getSaveLabel(visibility: StoryVisibility | 'draft'): string {
  if (visibility === 'private') return 'Save privately';
  if (visibility === 'draft') return 'Save draft';
  return 'Publish story';
}

export function VisibilityAndSave({
  selectedVisibility,
  onVisibilityChange,
  onSave,
  onBack,
  isSaving,
  isEditMode = false,
}: VisibilityAndSaveProps) {
  return (
    <div className="space-y-3">
      {isEditMode ? (
        /* Read-only visibility pill for existing stories (P586) */
        <div data-testid="visibility-selector">
          <p className="text-sm font-medium mb-2">Visibility</p>
          {(() => {
            const opt = VISIBILITY_OPTIONS.find(o => o.value === selectedVisibility) ?? VISIBILITY_OPTIONS[0];
            const Icon = opt.icon;
            return (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-muted text-muted-foreground text-sm cursor-default">
                <Icon className="w-4 h-4" />
                {opt.label}
              </span>
            );
          })()}
          <p className="text-xs text-muted-foreground mt-1.5">Visibility cannot be changed after creation.</p>
        </div>
      ) : (
        <fieldset data-testid="visibility-selector">
          <legend className="text-sm font-medium mb-2">Choose visibility</legend>
          <div className="flex gap-2 flex-wrap">
            {VISIBILITY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = selectedVisibility === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onVisibilityChange(opt.value)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm min-h-11 transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <button
        type="button"
        data-testid="save-story-button"
        disabled={isSaving}
        onClick={onSave}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg py-2.5 text-sm font-medium mt-3 transition-colors"
      >
        {isSaving ? 'Saving…' : getSaveLabel(selectedVisibility)}
      </button>

      <Button
        type="button"
        variant="ghost"
        onClick={onBack}
        className="w-full text-muted-foreground text-sm"
      >
        Back to editing
      </Button>
    </div>
  );
}
