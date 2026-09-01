/**
 * @file generateBanner.test.ts
 * @description Unit tests for P504: Generalized banner generation utility
 *
 * Tests:
 * - Entity type routing (event, story, profile)
 * - Prompt construction per entity type
 * - Input validation (truncation, control char stripping)
 * - Error handling for invalid entity types
 * - Edge function URL construction
 */

import { describe, it, expect } from 'vitest';

// ── Helpers: simulate the banner generation utility logic ────────────────────
// These test the pure logic that will be extracted into the generalized
// generateAIBanner utility. They validate prompt construction and input
// sanitization without calling the actual edge function.

/**
 * Strips control characters from user input (matches existing banner-utils pattern)
 */
function stripControlChars(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x1F\x7F]/g, '');
}

/**
 * Truncates text to maxLength characters
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

/**
 * Builds the prompt context for Gemini based on entity type.
 * This mirrors the logic that will exist in the generalized edge function.
 */
function buildPromptContext(params: {
  entityType: 'event' | 'story' | 'profile';
  title?: string;
  content?: string;
  statement?: string;
  name?: string;
  role?: string;
  avatarColor?: string;
  location?: string;
  keywords?: string;
}): string {
  const { entityType } = params;

  switch (entityType) {
    case 'event': {
      const title = truncateText(stripControlChars(params.title || ''), 200);
      const location = truncateText(stripControlChars(params.location || ''), 200);
      return `Generate a banner image for an event. Title: "${title}". Location: "${location}".`;
    }
    case 'story': {
      const title = truncateText(stripControlChars(params.title || ''), 200);
      const content = truncateText(stripControlChars(params.content || ''), 200);
      const text = title || content;
      return `Generate a banner image for a personal story. Title/content: "${text}".`;
    }
    case 'profile': {
      const name = truncateText(stripControlChars(params.name || 'ClarityPledge member'), 100);
      const role = truncateText(stripControlChars(params.role || ''), 100);
      const colorHint = params.avatarColor && /^#[0-9a-fA-F]{6}$/.test(params.avatarColor)
        ? ` Use ${params.avatarColor} as the primary color palette hint.`
        : '';
      return `Generate a banner image for a professional profile. Name: "${name}". Role: "${role}".${colorHint}`;
    }
    default:
      throw new Error(`Unknown entity type: ${entityType}`);
  }
}

/**
 * Validates the request body for the generalized generate-banner edge function.
 */
function validateRequestBody(body: Record<string, unknown>): { valid: boolean; error?: string } {
  const { entityType, entityId } = body;

  if (!entityType || !['event', 'story', 'profile'].includes(entityType as string)) {
    return { valid: false, error: `Invalid entityType: ${entityType}` };
  }

  if (!entityId || typeof entityId !== 'string') {
    return { valid: false, error: 'entityId is required' };
  }

  // UUID format check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(entityId as string)) {
    return { valid: false, error: 'entityId must be a valid UUID' };
  }

  return { valid: true };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('generateBanner — prompt construction', () => {
  describe('entity type routing', () => {
    it('builds event prompt with title and location', () => {
      const prompt = buildPromptContext({
        entityType: 'event',
        title: 'Morning Hike',
        location: 'Golden Gate Park',
      });
      expect(prompt).toContain('event');
      expect(prompt).toContain('Morning Hike');
      expect(prompt).toContain('Golden Gate Park');
    });

    it('builds story prompt with title/content', () => {
      const prompt = buildPromptContext({
        entityType: 'story',
        title: 'My Leadership Journey',
        content: 'It all started when...',
      });
      expect(prompt).toContain('personal story');
      expect(prompt).toContain('My Leadership Journey');
    });

    it('builds story prompt using content when title is empty', () => {
      const prompt = buildPromptContext({
        entityType: 'story',
        title: '',
        content: 'A story about trust',
      });
      expect(prompt).toContain('A story about trust');
    });

    it('builds profile prompt with name and role', () => {
      const prompt = buildPromptContext({
        entityType: 'profile',
        name: 'Slava',
        role: 'Engineering Lead',
      });
      expect(prompt).toContain('professional profile');
      expect(prompt).toContain('Slava');
      expect(prompt).toContain('Engineering Lead');
    });

    it('builds profile prompt with avatar color hint when valid hex', () => {
      const prompt = buildPromptContext({
        entityType: 'profile',
        name: 'Slava',
        role: 'Lead',
        avatarColor: '#4A90E2',
      });
      expect(prompt).toContain('#4A90E2');
      expect(prompt).toContain('color palette hint');
    });

    it('omits avatar color hint when invalid hex format', () => {
      const prompt = buildPromptContext({
        entityType: 'profile',
        name: 'Slava',
        role: 'Lead',
        avatarColor: 'not-a-color',
      });
      expect(prompt).not.toContain('not-a-color');
      expect(prompt).not.toContain('color palette hint');
    });

    it('uses fallback name for profile with no name', () => {
      const prompt = buildPromptContext({
        entityType: 'profile',
        name: '',
        role: 'Developer',
      });
      expect(prompt).toContain('ClarityPledge member');
    });

    it('throws for unknown entity type', () => {
      expect(() =>
        buildPromptContext({
          entityType: 'unknown' as any,
        })
      ).toThrow('Unknown entity type');
    });
  });

  describe('input validation — truncation', () => {
    it('truncates story title to 200 characters', () => {
      const longTitle = 'A'.repeat(300);
      const prompt = buildPromptContext({
        entityType: 'story',
        title: longTitle,
      });
      // The prompt should contain exactly 200 A's, not 300
      const match = prompt.match(/A+/);
      expect(match).toBeTruthy();
      expect(match![0].length).toBe(200);
    });

    it('truncates profile name to 100 characters', () => {
      const longName = 'C'.repeat(150);
      const prompt = buildPromptContext({
        entityType: 'profile',
        name: longName,
        role: 'Dev',
      });
      const match = prompt.match(/C+/);
      expect(match).toBeTruthy();
      expect(match![0].length).toBe(100);
    });

    it('truncates profile role to 100 characters', () => {
      const longRole = 'D'.repeat(150);
      const prompt = buildPromptContext({
        entityType: 'profile',
        name: 'Test',
        role: longRole,
      });
      const match = prompt.match(/D+/);
      expect(match).toBeTruthy();
      expect(match![0].length).toBe(100);
    });
  });

  describe('input validation — control character stripping', () => {
    it('strips control characters from story title', () => {
      const prompt = buildPromptContext({
        entityType: 'story',
        title: 'Hello\x00World\x1FTest',
      });
      expect(prompt).toContain('HelloWorldTest');
      // eslint-disable-next-line no-control-regex
      expect(prompt).not.toMatch(/[\x00-\x1F]/);
    });

    it('strips control characters from profile name', () => {
      const prompt = buildPromptContext({
        entityType: 'profile',
        name: 'Sla\x00va',
        role: 'Lead',
      });
      expect(prompt).toContain('Slava');
    });

    it('strips tab and newline from inputs', () => {
      const prompt = buildPromptContext({
        entityType: 'story',
        title: 'Line1\nLine2\tTabbed',
      });
      expect(prompt).toContain('Line1Line2Tabbed');
    });
  });
});

describe('generateBanner — request body validation', () => {
  it('accepts valid event request', () => {
    const result = validateRequestBody({
      entityType: 'event',
      entityId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid story request', () => {
    const result = validateRequestBody({
      entityType: 'story',
      entityId: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.valid).toBe(true);
  });

  it('accepts valid profile request', () => {
    const result = validateRequestBody({
      entityType: 'profile',
      entityId: '550e8400-e29b-41d4-a716-446655440003',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects missing entityType', () => {
    const result = validateRequestBody({
      entityId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('entityType');
  });

  it('rejects invalid entityType', () => {
    const result = validateRequestBody({
      entityType: 'blogpost',
      entityId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('entityType');
  });

  it('rejects missing entityId', () => {
    const result = validateRequestBody({
      entityType: 'story',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('entityId');
  });

  it('rejects non-UUID entityId', () => {
    const result = validateRequestBody({
      entityType: 'story',
      entityId: 'not-a-uuid',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('UUID');
  });

  it('rejects numeric entityId', () => {
    const result = validateRequestBody({
      entityType: 'event',
      entityId: 12345,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects 'point' as an entityType (P1189: point banners were removed)", () => {
    const result = validateRequestBody({
      entityType: 'point',
      entityId: '550e8400-e29b-41d4-a716-446655440002',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('entityType');
  });
});
