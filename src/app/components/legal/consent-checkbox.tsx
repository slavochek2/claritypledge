/**
 * Active consent checkbox component
 * Used in letter response signup flow and any future active-consent flows.
 * Distinct from ConsentNotice (passive) — this requires explicit checkbox interaction.
 */

import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';

interface ConsentCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

export function ConsentCheckbox({
  checked,
  onCheckedChange,
  disabled = false,
  id = 'consent-checkbox',
}: ConsentCheckboxProps) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
        className="mt-0.5"
      />
      <label
        htmlFor={id}
        className="text-sm text-muted-foreground leading-snug cursor-pointer"
      >
        I accept the{' '}
        <a
          href="/terms-of-service"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          Terms of Service
        </a>{' '}
        and{' '}
        <a
          href="/privacy-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          Privacy Policy
        </a>
        . We&apos;ll create an account to save your responses.
      </label>
    </div>
  );
}
