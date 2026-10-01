/**
 * @file PrepSettingsFields.tsx
 * @description P1336 per-event setup on create/edit: the Preparation on/off setting and the
 * statement tag the positions step reads. Volunteer places stay SQL-only (no UI, by decision).
 */
import { ListChecks } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** The series default: Clarity Night on, everything else (hikes …) off. */
export const defaultPreparation = (title: string) => /clarity night/i.test(title);

/** Same shape the events.statement_tag CHECK enforces. Empty = no positions step. */
export function validateStatementTag(raw: string): string | null {
  const tag = raw.trim().replace(/^#/, '');
  if (!tag) return null;
  return /^[a-z0-9][a-z0-9_-]{0,49}$/.test(tag) ? null : 'Use lowercase letters, numbers, - or _ (no spaces).';
}

export const normalizeStatementTag = (raw: string) => raw.trim().replace(/^#/, '');

export function PrepSettingsFields({
  enabled,
  onEnabledChange,
  tag,
  onTagChange,
  tagError,
}: {
  enabled: boolean;
  onEnabledChange: (on: boolean) => void;
  tag: string;
  onTagChange: (tag: string) => void;
  tagError?: string;
}) {
  return (
    <div className="space-y-3" data-testid="prep-settings">
      <div className="flex items-start gap-3">
        <Checkbox
          id="preparationEnabled"
          checked={enabled}
          onCheckedChange={(v) => onEnabledChange(v === true)}
          className="mt-1"
          data-testid="prep-enabled"
        />
        <div>
          <Label htmlFor="preparationEnabled" className="flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            Preparation
          </Label>
          <p className="text-xs text-muted-foreground mt-1">
            After registering, attendees are asked to prepare: the intro videos, the meeting principle, their
            positions and the R&amp;D question.
          </p>
        </div>
      </div>
      {enabled && (
        <div>
          <Label htmlFor="statementTag" className="mb-2 block">Statement tag</Label>
          <Input
            id="statementTag"
            value={tag}
            onChange={(e) => onTagChange(e.target.value)}
            placeholder="e.g., ikigai1"
            className={tagError ? 'border-red-500' : ''}
            data-testid="prep-statement-tag"
          />
          {tagError
            ? <p className="text-sm text-red-500 mt-1">{tagError}</p>
            : <p className="text-xs text-muted-foreground mt-1">Optional. The points attendees set positions on. Empty = no positions step.</p>}
        </div>
      )}
    </div>
  );
}
