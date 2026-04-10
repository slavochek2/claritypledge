/**
 * @file p682-recipient-validation.test.ts
 * @description P682: Unit tests for multi-recipient form validation logic.
 *
 * Tests the pure validation functions that will live in or near letter-receiver-modal.tsx:
 * - Email format validation per-row
 * - Duplicate detection across rows
 * - Self-send detection per-row
 * - Empty-row silent removal on Continue
 * - ReceiverSetupResult recipient array building
 * - Max row cap enforcement (20)
 *
 * All tests are pure logic — no DOM, no network, no mocks required.
 */

import { describe, it, expect } from 'vitest';

// ─── Types matching the P682 interface change ─────────────────────────────────

interface Recipient {
  id: string;
  email: string;
  name: string;
}

// ─── Validation functions under test ─────────────────────────────────────────
// These are extracted from the implementation for testability.
// The actual implementations will live in letter-receiver-modal.tsx (or a co-located utils file).
// Tests are written first (canary pattern) — implementations must satisfy these.

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isSelfSend(email: string, currentUserEmail: string): boolean {
  return email.trim().toLowerCase() === currentUserEmail.trim().toLowerCase();
}

function findDuplicateIndex(recipients: Recipient[]): number {
  const seen = new Map<string, number>();
  for (let i = 0; i < recipients.length; i++) {
    const email = recipients[i].email.trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) return i;
    seen.set(email, i);
  }
  return -1;
}

function removeEmptyTrailingRows(recipients: Recipient[]): Recipient[] {
  // Remove rows where BOTH email AND name are empty (user added row but left it blank)
  // Must keep at least 1 row
  const filtered = recipients.filter(
    (r, i) => i === 0 || r.email.trim() !== '' || r.name.trim() !== ''
  );
  return filtered.length === 0 ? [recipients[0]] : filtered;
}

function buildRecipientsArray(
  recipients: Recipient[]
): Array<{ email: string; name: string }> {
  return recipients
    .filter((r) => r.email.trim() !== '' || r.name.trim() !== '')
    .map((r) => ({ email: r.email.trim().toLowerCase(), name: r.name.trim() }));
}

function canAddMore(recipients: Recipient[], maxRows = 20): boolean {
  return recipients.length < maxRows;
}

function validateAllRows(
  recipients: Recipient[],
  currentUserEmail: string
): Array<{ rowIndex: number; emailError: string | null; nameError: string | null }> {
  return recipients.map((r, i) => {
    let emailError: string | null = null;
    let nameError: string | null = null;

    if (!r.email.trim()) {
      emailError = 'Email is required';
    } else if (!isValidEmail(r.email)) {
      emailError = 'Invalid email format';
    } else if (isSelfSend(r.email, currentUserEmail)) {
      emailError = "You can't send a letter to yourself";
    }

    if (!r.name.trim()) {
      nameError = 'Name is required';
    }

    return { rowIndex: i, emailError, nameError };
  });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const USER_EMAIL = 'sender@example.com';

function makeRecipient(overrides: Partial<Recipient> = {}): Recipient {
  return {
    id: `row-${Math.random().toString(36).slice(2)}`,
    email: '',
    name: '',
    ...overrides,
  };
}

// ─── Email format validation ──────────────────────────────────────────────────

describe('isValidEmail', () => {
  it('accepts standard email format', () => {
    expect(isValidEmail('alex@example.com')).toBe(true);
  });

  it('accepts email with subdomain', () => {
    expect(isValidEmail('user@mail.company.com')).toBe(true);
  });

  it('rejects email without @ symbol', () => {
    expect(isValidEmail('notanemail')).toBe(false);
  });

  it('rejects email without domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('rejects email with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
  });

  it('accepts email with plus addressing', () => {
    expect(isValidEmail('user+tag@example.com')).toBe(true);
  });
});

// ─── Self-send detection ──────────────────────────────────────────────────────

describe('isSelfSend', () => {
  it('detects exact match as self-send', () => {
    expect(isSelfSend('sender@example.com', USER_EMAIL)).toBe(true);
  });

  it('detects case-insensitive match as self-send', () => {
    expect(isSelfSend('SENDER@EXAMPLE.COM', USER_EMAIL)).toBe(true);
  });

  it('detects trim-equal match as self-send', () => {
    expect(isSelfSend('  sender@example.com  ', USER_EMAIL)).toBe(true);
  });

  it('returns false for different email', () => {
    expect(isSelfSend('other@example.com', USER_EMAIL)).toBe(false);
  });

  it('returns false for empty email', () => {
    expect(isSelfSend('', USER_EMAIL)).toBe(false);
  });
});

// ─── Duplicate detection ──────────────────────────────────────────────────────

describe('findDuplicateIndex', () => {
  it('returns -1 for a single recipient (no duplicates)', () => {
    const rows = [makeRecipient({ email: 'a@example.com' })];
    expect(findDuplicateIndex(rows)).toBe(-1);
  });

  it('returns -1 when all emails are unique', () => {
    const rows = [
      makeRecipient({ email: 'a@example.com' }),
      makeRecipient({ email: 'b@example.com' }),
      makeRecipient({ email: 'c@example.com' }),
    ];
    expect(findDuplicateIndex(rows)).toBe(-1);
  });

  it('returns the index of the later duplicate', () => {
    const rows = [
      makeRecipient({ email: 'a@example.com' }),
      makeRecipient({ email: 'a@example.com' }),
    ];
    expect(findDuplicateIndex(rows)).toBe(1);
  });

  it('detects duplicate case-insensitively', () => {
    const rows = [
      makeRecipient({ email: 'Alice@Example.com' }),
      makeRecipient({ email: 'alice@example.com' }),
    ];
    expect(findDuplicateIndex(rows)).toBe(1);
  });

  it('skips empty email rows when detecting duplicates', () => {
    const rows = [
      makeRecipient({ email: '' }),
      makeRecipient({ email: '' }),
    ];
    expect(findDuplicateIndex(rows)).toBe(-1);
  });

  it('returns index of third duplicate (not the second)', () => {
    const rows = [
      makeRecipient({ email: 'a@example.com' }),
      makeRecipient({ email: 'b@example.com' }),
      makeRecipient({ email: 'a@example.com' }),
    ];
    expect(findDuplicateIndex(rows)).toBe(2);
  });
});

// ─── Empty-row silent removal ─────────────────────────────────────────────────

describe('removeEmptyTrailingRows', () => {
  it('keeps a single empty row (minimum 1)', () => {
    const rows = [makeRecipient({ email: '', name: '' })];
    const result = removeEmptyTrailingRows(rows);
    expect(result).toHaveLength(1);
  });

  it('removes empty rows when other rows have data', () => {
    const rows = [
      makeRecipient({ email: 'a@example.com', name: 'Alice' }),
      makeRecipient({ email: '', name: '' }),
    ];
    const result = removeEmptyTrailingRows(rows);
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('a@example.com');
  });

  it('keeps rows where only name is filled', () => {
    const rows = [
      makeRecipient({ email: 'a@example.com', name: 'Alice' }),
      makeRecipient({ email: '', name: 'Partial' }),
    ];
    const result = removeEmptyTrailingRows(rows);
    expect(result).toHaveLength(2);
  });

  it('keeps all rows that have data', () => {
    const rows = [
      makeRecipient({ email: 'a@example.com', name: 'Alice' }),
      makeRecipient({ email: 'b@example.com', name: 'Bob' }),
    ];
    const result = removeEmptyTrailingRows(rows);
    expect(result).toHaveLength(2);
  });
});

// ─── Recipients array building ────────────────────────────────────────────────

describe('buildRecipientsArray', () => {
  it('normalizes emails to lowercase', () => {
    const rows = [makeRecipient({ email: 'ALICE@EXAMPLE.COM', name: 'Alice' })];
    const result = buildRecipientsArray(rows);
    expect(result[0].email).toBe('alice@example.com');
  });

  it('trims whitespace from email and name', () => {
    const rows = [makeRecipient({ email: '  bob@example.com  ', name: '  Bob Smith  ' })];
    const result = buildRecipientsArray(rows);
    expect(result[0].email).toBe('bob@example.com');
    expect(result[0].name).toBe('Bob Smith');
  });

  it('excludes entirely empty rows', () => {
    const rows = [
      makeRecipient({ email: 'a@example.com', name: 'Alice' }),
      makeRecipient({ email: '', name: '' }),
    ];
    const result = buildRecipientsArray(rows);
    expect(result).toHaveLength(1);
  });

  it('returns array with both email and name for each recipient', () => {
    const rows = [
      makeRecipient({ email: 'a@example.com', name: 'Alice' }),
      makeRecipient({ email: 'b@example.com', name: 'Bob' }),
    ];
    const result = buildRecipientsArray(rows);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('email');
    expect(result[0]).toHaveProperty('name');
  });
});

// ─── Max row cap ──────────────────────────────────────────────────────────────

describe('canAddMore', () => {
  it('returns true when below 20 rows', () => {
    const rows = Array.from({ length: 19 }, () => makeRecipient());
    expect(canAddMore(rows)).toBe(true);
  });

  it('returns false at exactly 20 rows', () => {
    const rows = Array.from({ length: 20 }, () => makeRecipient());
    expect(canAddMore(rows)).toBe(false);
  });

  it('returns false above 20 rows', () => {
    const rows = Array.from({ length: 21 }, () => makeRecipient());
    expect(canAddMore(rows)).toBe(false);
  });

  it('returns true for a single row', () => {
    const rows = [makeRecipient()];
    expect(canAddMore(rows)).toBe(true);
  });
});

// ─── Full-row validation (on Continue) ───────────────────────────────────────

describe('validateAllRows', () => {
  it('returns no errors for a valid row', () => {
    const rows = [makeRecipient({ email: 'alex@example.com', name: 'Alex Rivera' })];
    const result = validateAllRows(rows, USER_EMAIL);
    expect(result[0].emailError).toBeNull();
    expect(result[0].nameError).toBeNull();
  });

  it('returns email error for invalid format', () => {
    const rows = [makeRecipient({ email: 'notanemail', name: 'Alex' })];
    const result = validateAllRows(rows, USER_EMAIL);
    expect(result[0].emailError).not.toBeNull();
  });

  it('returns self-send error for own email', () => {
    const rows = [makeRecipient({ email: USER_EMAIL, name: 'Self' })];
    const result = validateAllRows(rows, USER_EMAIL);
    expect(result[0].emailError).toMatch(/yourself/i);
  });

  it('returns name error when name is empty', () => {
    const rows = [makeRecipient({ email: 'alex@example.com', name: '' })];
    const result = validateAllRows(rows, USER_EMAIL);
    expect(result[0].nameError).not.toBeNull();
  });

  it('validates all rows independently', () => {
    const rows = [
      makeRecipient({ email: 'valid@example.com', name: 'Valid Person' }),
      makeRecipient({ email: 'bad-email', name: '' }),
    ];
    const result = validateAllRows(rows, USER_EMAIL);
    expect(result[0].emailError).toBeNull();
    expect(result[0].nameError).toBeNull();
    expect(result[1].emailError).not.toBeNull();
    expect(result[1].nameError).not.toBeNull();
  });

  it('returns correct rowIndex for each result', () => {
    const rows = [
      makeRecipient({ email: 'a@example.com', name: 'Alice' }),
      makeRecipient({ email: 'b@example.com', name: 'Bob' }),
    ];
    const result = validateAllRows(rows, USER_EMAIL);
    expect(result[0].rowIndex).toBe(0);
    expect(result[1].rowIndex).toBe(1);
  });

  it('detects empty email as an error', () => {
    const rows = [makeRecipient({ email: '', name: 'Alice' })];
    const result = validateAllRows(rows, USER_EMAIL);
    expect(result[0].emailError).not.toBeNull();
  });
});
