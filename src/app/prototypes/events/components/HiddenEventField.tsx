/**
 * @file HiddenEventField.tsx
 * @description P1603 the "Hidden event" checkbox on the create and edit forms, in the same checkbox + label + helper
 * shape as PrepSettingsFields. [FOUNDER DECISION: label "Hidden event"; helper "Only people with the link can see it.
 * It won't appear in event lists." Proposed in the spec, not yet confirmed.]
 */
import { EyeOff } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export function HiddenEventField({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (on: boolean) => void }) {
  return (
    <div className="flex items-start gap-3" data-testid="hidden-event-field">
      <Checkbox
        id="isHidden"
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="mt-1"
        data-testid="hidden-event-checkbox"
      />
      <div>
        <Label htmlFor="isHidden" className="flex items-center gap-2">
          <EyeOff className="w-4 h-4" />
          Hidden event
        </Label>
        <p className="text-xs text-muted-foreground mt-1">
          Only people with the link can see it. It won't appear in event lists.
        </p>
      </div>
    </div>
  );
}
