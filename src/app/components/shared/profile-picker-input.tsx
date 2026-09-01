/**
 * @file profile-picker-input.tsx
 * @description P878: relationship-scoped people picker (AD-5).
 *
 * Wraps an email input with a typeahead dropdown over `search_profiles` (via
 * useProfileSearch). Selecting a result yields a ProfileSearchResult chip carrying
 * profile_id — the invite is then addressed server-side by profile_id (AD-6); the
 * raw email path stays available as the first-contact fallback (anything containing
 * '@' skips search and flows to the parent's existing email handling).
 *
 * ARIA contract (combobox pattern, asserted by e2e/a11y/p878-picker-accessibility.spec.ts):
 * role="combobox" + aria-expanded + aria-activedescendant on the input,
 * role="listbox" on the dropdown, role="option" + id per row,
 * ArrowDown/ArrowUp move the active option, Enter selects, Escape closes
 * (focus stays on the input).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { BadgeCheck, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { useProfileSearch, isSearchableQuery } from '@/app/hooks/use-profile-search';
import type { ProfileSearchResult } from '@/app/data/agreements-service';

// Verbatim UI Contract copy — do not paraphrase (e2e asserts the exact string).
const EMPTY_STATE_COPY =
  "No one you've connected with matches. Enter their email to invite them.";

interface ProfilePickerInputProps {
  /** Raw input text — a name fragment (search) or an email (first-contact fallback). */
  value: string;
  /** Fires on every keystroke. Parents keep their existing email-lookup handling here. */
  onValueChange: (text: string) => void;
  /** Currently selected person (chip state), or null for free text entry. */
  selected: ProfileSearchResult | null;
  /** Selection change: a result on pick, null when the chip is removed. */
  onSelect: (result: ProfileSearchResult | null) => void;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  hasError?: boolean;
  /** Parent-driven busy indicator (e.g. exact-email lookup in flight). */
  isBusy?: boolean;
  autoComplete?: string;
}

export function ProfilePickerInput({
  value,
  onValueChange,
  selected,
  onSelect,
  id,
  placeholder = 'Name or email',
  ariaLabel,
  hasError = false,
  isBusy = false,
  autoComplete,
}: ProfilePickerInputProps) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, isSearching, hasSearched } = useProfileSearch(value);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const searchable = isSearchableQuery(value);
  const open = !selected && searchable && hasSearched && !dismissed;

  // New query → un-dismiss and reset keyboard position
  useEffect(() => {
    setDismissed(false);
    setActiveIndex(-1);
  }, [value]);

  const optionId = (index: number) => `${reactId}-option-${index}`;

  const handleSelect = (result: ProfileSearchResult) => {
    onSelect(result);
    onValueChange('');
    setActiveIndex(-1);
  };

  const handleClear = () => {
    onSelect(null);
    // Re-focus the input after the chip unmounts so typing can resume immediately.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      // ARIA combobox pattern: ArrowDown re-opens a dismissed dropdown.
      if (e.key === 'ArrowDown' && searchable && hasSearched && dismissed) {
        e.preventDefault();
        setDismissed(false);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length > 0) setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length > 0) setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) {
        handleSelect(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      // Close the dropdown only — stopPropagation so a containing Dialog stays open.
      e.preventDefault();
      e.stopPropagation();
      setDismissed(true);
      setActiveIndex(-1);
    }
  };

  // ── Chip state — a person is selected ──────────────────────────────────────
  if (selected) {
    return (
      <div
        data-testid="profile-picker-chip"
        className="flex items-center gap-2 rounded-md border border-input bg-blue-50/50 px-3 py-2 min-h-11"
      >
        <GravatarAvatar
          name={selected.name}
          photoUrl={selected.avatarUrl ?? undefined}
          avatarColor={selected.avatarColor}
          isPledger={selected.hasPledged}
          size="sm"
          showRing={false}
          className="!w-7 !h-7 text-xs"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{selected.name}</span>
        {(selected.isVerified || selected.hasPledged) && (
          <BadgeCheck
            aria-label={selected.isVerified ? 'Verified' : 'Pledged'}
            className="w-4 h-4 text-blue-500 flex-shrink-0"
          />
        )}
        <button
          type="button"
          onClick={handleClear}
          aria-label="Remove selected person"
          className="flex-shrink-0 p-2 -m-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Input + dropdown state ──────────────────────────────────────────────────
  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-label={ariaLabel}
        data-testid="profile-picker-input"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={hasError ? 'border-red-500' : ''}
        autoComplete={autoComplete ?? 'off'}
      />
      {(isSearching || isBusy) && (
        <div className="absolute right-3 top-2.5">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {open && (
        <div
          id={listboxId}
          role="listbox"
          data-testid="profile-picker-dropdown"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-background shadow-lg"
        >
          {results.map((result, index) => (
            <div
              key={result.profileId}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              // Combobox pattern: keyboard interaction happens on the input
              // (aria-activedescendant + Enter); options stay focusable for AT.
              tabIndex={-1}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSelect(result);
              }}
              data-testid="profile-picker-option"
              // mousedown preventDefault keeps focus on the input so click registers
              // before any blur-driven close.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(result)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 ${
                index === activeIndex ? 'bg-accent' : ''
              }`}
            >
              <span data-testid="avatar" className="flex-shrink-0">
                <GravatarAvatar
                  name={result.name}
                  photoUrl={result.avatarUrl ?? undefined}
                  avatarColor={result.avatarColor}
                  isPledger={result.hasPledged}
                  size="sm"
                  showRing={false}
                  className="!w-8 !h-8 text-xs"
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{result.name}</span>
              {/* Badge text hides below sm so the name keeps identity-distinguishing room
                  at 320px; the icon + aria-label remain (non-color-only distinction). */}
              {result.isVerified ? (
                <span
                  data-testid="verified-badge"
                  aria-label="Verified"
                  className="flex flex-shrink-0 items-center gap-1 text-xs text-blue-600"
                >
                  <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Verified</span>
                </span>
              ) : result.hasPledged ? (
                <span
                  data-testid="pledged-badge"
                  aria-label="Pledged"
                  className="flex flex-shrink-0 items-center gap-1 text-xs text-blue-600"
                >
                  <BadgeCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Pledged</span>
                </span>
              ) : null}
            </div>
          ))}

          {results.length === 0 && (
            <div
              data-testid="profile-picker-empty-state"
              className="px-3 py-3 text-sm text-muted-foreground"
              role="status"
            >
              {EMPTY_STATE_COPY}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
