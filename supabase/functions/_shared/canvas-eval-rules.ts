/**
 * P1536 S2.2 and section 3b Q1: the rules the real-model eval applies to every point the drafting agent writes. Pure (no imports), so the
 * eval script and vitest load it as it is; nothing in the running product imports it.
 *
 *  - voice: no Customer Segments point starts with "I", "We", "My customers" or "I sell to";
 *  - values-shape: every Guiding values point matches `X over Y, because Z`;
 *  - number-grounding: every number in every point appears in the owner's material;
 *  - segment-specificity (Q1): a Customer Segments point names a role or title, plus at least two of industry, company size, demographics,
 *    psychographics.
 *
 * The Q1 detector is a SMALL LEXICON, on purpose: it finds the common forms of each dimension and says which it found. It flags points
 * for the eval's report and for a human read; it is not a language model and it can miss a form it has no word for. Labelled fixtures
 * (src/tests/p1536-s2-eval-rules.test.ts) pin what it finds and what it must reject. A lexicon is extended by adding a fixture first.
 */

export type SegmentDimension = 'industry' | 'size' | 'demographics' | 'psychographics';

/** A job title or a role in a sale. Category words ("businesses", "companies", "customers") are not roles. */
const ROLE = new RegExp(
  '\\b(?:owners?|founders?|co-?founders?|managers?|directors?|heads? of|leads?|chiefs?|officers?|ceos?|ctos?|cfos?|coos?|vps?|vice presidents?|presidents?|'
  + 'principals?|partners?|engineers?|developers?|designers?|architects?|accountants?|bookkeepers?|teachers?|professors?|nurses?|doctors?|physicians?|'
  + 'dentists?|therapists?|consultants?|freelancers?|coaches?|trainers?|buyers?|procurement|administrators?|assistants?|recruiters?|analysts?|chefs?|'
  + 'cooks?|drivers?|technicians?|supervisors?|coordinators?|operators?|agents?|brokers?|advisors?|advisers?|lawyers?|attorneys?|students?|parents?|'
  + 'researchers?|writers?|editors?|marketers?|salespeople|sellers?|retailers?|farmers?|contractors?|electricians?|plumbers?|pharmacists?|'
  + 'receptionists?|clerks?|controllers?|treasurers?|superintendents?|foremen|foreman)\\b',
  'i',
);

const INDUSTRY = new RegExp(
  '\\b(?:caf[eé]s?|restaurants?|bakeries|bakery|bars?|hotels?|hospitality|logistics|shipping|freight|manufactur\\w*|factories|retail\\w*|wholesale|saas|software|'
  + 'fintech|banks?|banking|insurance|health ?care|clinics?|hospitals?|pharma\\w*|biotech|education|schools?|universities|construction|real estate|property|'
  + 'agenc(?:y|ies)|e-?commerce|farms?|farming|agricultur\\w*|law firms?|legal|accounting firms?|consultanc(?:y|ies)|non-?profits?|energy|mining|'
  + 'telecom\\w*|media|publishing|gaming|travel|tourism|automotive|aviation|food|beverage|fashion|beauty|salons?|gyms?|fitness|startups?|studios?)\\b',
  'i',
);

/** A count of people or units (staff, shops), a range of them before a unit noun, or a named scale. Bare "small" and "large" are category words and do not count. */
const SIZE = new RegExp(
  '\\b\\d[\\d,.]*\\s*(?:(?:-|–|to)\\s*\\d[\\d,.]*\\s*)?(?:staff|employees?|people|seats|users|ftes?|headcount|workers|members)\\b'
  + '|\\b(?:with|of)\\s+\\d[\\d,.]*\\s*(?:(?:-|–|to)\\s*\\d[\\d,.]*\\s*)?(?:\\w+\\s+){0,2}(?:staff|employees?|people|seats|users|workers|members)\\b'
  + '|\\b\\d[\\d,.]*\\s*(?:(?:-|–|to)\\s*\\d[\\d,.]*\\s*)?(?:independent\\s+|small\\s+|local\\s+)?(?:caf[eé]s|shops|stores|locations|outlets|branches|sites|clinics|restaurants|offices|depots|trucks|vehicles)\\b'
  + '|\\b(?:solo|one-person|one-man|mid-?sized|midsize|enterprise|family-run|owner-operated)\\b'
  + '|\\b(?:under|over|above|below|around)\\s+[€$£]?\\d[\\d,.]*\\s*(?:k|m|million|thousand)?\\s*(?:in\\s+)?(?:revenue|turnover|sales)\\b',
  'i',
);

const DEMOGRAPHICS = new RegExp(
  '\\baged?\\s+\\d'
  + '|\\b\\d{2}\\s*(?:-|–|to)\\s*\\d{2}\\s*(?:years?|year-old|yo|y/o)\\b'
  + '|\\b(?:in|into)\\s+their\\s+(?:early\\s+|mid\\s+|mid-|late\\s+)?(?:\\d0s|teens|twenties|thirties|forties|fifties|sixties)\\b'
  + '|\\b(?:women|men|mothers?|fathers?|moms?|dads?|seniors?|retirees?|retired|millennials?|gen ?z|teenagers?|immigrants?|expats?|first-time|newly)\\b'
  // a place: "in Tallinn", "based in Estonia" (a capital letter after the preposition keeps "in time" out)
  + '|\\b(?:in|based in|across|around)\\s+(?:[A-Z][\\p{L}-]+)',
  'u',
);

const PSYCHOGRAPHICS = new RegExp(
  '\\bwho\\s+(?:also\\s+)?(?:value|prefer|worry|worries|fear|hate|dislike|distrust|mistrust|trust|care about|care deeply|avoid|resist|tend to|like to|love|enjoy|insist|refuse|believe|are\\s+(?:wary|anxious|skeptical|sceptical|cautious|overwhelmed|risk-averse|time-poor|early adopters?))\\b'
  + '|\\b(?:risk-averse|early adopters?|late adopters?|skeptical|sceptical|time-poor|overwhelmed|ambitious|cautious|privacy-conscious|eco-conscious|price-sensitive|tech-savvy|perfectionists?|pragmatic|conservative)\\b',
  'i',
);

/** "Pays:", "Uses:", "Approves:" label a role in one sale: they are not part of the description. */
const SALE_LABEL = /^\s*(?:pays|uses|approves)\s*:\s*/i;

export interface SegmentClassification {
  role: boolean;
  dimensions: SegmentDimension[];
}

/** What the lexicon finds in one Customer Segments point. */
export function classifySegment(text: string): SegmentClassification {
  const t = text.replace(SALE_LABEL, '');
  const dimensions: SegmentDimension[] = [];
  if (INDUSTRY.test(t)) dimensions.push('industry');
  if (SIZE.test(t)) dimensions.push('size');
  if (DEMOGRAPHICS.test(t)) dimensions.push('demographics');
  if (PSYCHOGRAPHICS.test(t)) dimensions.push('psychographics');
  return { role: ROLE.test(t), dimensions };
}

/** Q1: a role or title, plus at least two of industry, company size, demographics, psychographics. `missing` says which part fell short. */
export function segmentSpecificity(text: string): { ok: boolean; missing: 'role' | 'dimensions' | null; role: boolean; dimensions: SegmentDimension[] } {
  const c = classifySegment(text);
  if (!c.role) return { ok: false, missing: 'role', ...c };
  if (c.dimensions.length < 2) return { ok: false, missing: 'dimensions', ...c };
  return { ok: true, missing: null, ...c };
}

/** S2.2 rule 1: Customer Segments describes the customer and never starts with "I", "We", "My customers" or "I sell to". */
export function startsWithBannedOpening(text: string): boolean {
  return /^\s*(?:i|we|my customers)\b/i.test(text.replace(/^["'“”‘’\s]+/, ''));
}

/** S2.2 rule 2: a Guiding values point is `X over Y, because Z`. */
export function isGuidingValueShape(text: string): boolean {
  return /^\s*\S.*\sover\s.+,\s*because\s+\S/i.test(text);
}

/** S2.2 rule 3: the numbers in a point (digits, thousands commas and decimals kept) that the material does not contain. */
export function numbersNotInMaterial(text: string, material: string): string[] {
  const inMaterial = new Set((material.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,$/, '')));
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,$/, '')).filter((n) => !inMaterial.has(n));
}

export type EvalRule = 'voice' | 'values-shape' | 'number-grounding' | 'segment-specificity';
export interface EvalViolation { box: string; text: string; rule: EvalRule; detail?: string }

/** Every rule on every point of one eval pack: [] is a clean pack. */
export function checkEvalPoints(points: ReadonlyArray<{ box: string; text: string }>, material: string): EvalViolation[] {
  const out: EvalViolation[] = [];
  for (const { box, text } of points) {
    if (box === 'canvas:segments') {
      if (startsWithBannedOpening(text)) out.push({ box, text, rule: 'voice' });
      const q1 = segmentSpecificity(text);
      if (!q1.ok) out.push({ box, text, rule: 'segment-specificity', detail: q1.missing ?? undefined });
    }
    if (box === 'canvas:love' && !isGuidingValueShape(text)) out.push({ box, text, rule: 'values-shape' });
    const loose = numbersNotInMaterial(text, material);
    if (loose.length) out.push({ box, text, rule: 'number-grounding', detail: loose.join(', ') });
  }
  return out;
}
