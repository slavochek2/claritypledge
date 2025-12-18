/**
 * @file demo-config.ts
 * @description Configuration for the 5-level guided demo flow.
 * Each level has a prompt, speaker role, and position requirements.
 */
import type { DemoLevelConfig, DemoFlowState } from '@/app/types';

/** The 5 demo levels with their configuration */
export const DEMO_LEVELS: DemoLevelConfig[] = [
  {
    level: 1,
    title: 'Fact',
    prompt: 'Share something obviously true.',
    speakerRole: 'creator',
    positionRequired: true, // Easy warmup - get them used to position buttons
  },
  {
    level: 2,
    title: 'Disagreeable Fact',
    prompt: 'Share something true that some people might disagree with.',
    speakerRole: 'joiner',
    positionRequired: true, // Key lesson: understanding ≠ agreement
  },
  {
    level: 3,
    title: 'Personal',
    prompt: 'Share something personal or emotional.',
    speakerRole: 'creator',
    positionRequired: false, // Sometimes being understood is enough
  },
  {
    level: 4,
    title: 'Deep Value',
    prompt: 'Share a core belief or value that matters to you.',
    speakerRole: 'joiner',
    positionRequired: false, // Speaker decides if position matters
  },
  {
    level: 5,
    title: 'The Commitment',
    prompt: '', // Uses COMMITMENT_TEXT instead
    speakerRole: 'creator', // Doesn't matter - both paraphrase
    positionRequired: false,
    isCommitmentLevel: true,
  },
];

/** The commitment text both partners must paraphrase in Level 5 */
export const LEVEL_5_COMMITMENT_TEXT = `For the next 10 minutes, I commit to genuinely trying to understand your perspective—not to agree with it, but to understand it as you mean it—before sharing my own.`;

/** Initial state for a new demo flow */
export function createInitialDemoState(): DemoFlowState {
  return {
    currentLevel: 1,
    currentRound: 1,
    phase: 'idea',
    ideaConfirmed: false,
    paraphraseConfirmed: false,
    isAccepted: false,
    positionConfirmed: false,
  };
}

/** Get the level config for a given level number */
export function getLevelConfig(level: number): DemoLevelConfig | undefined {
  return DEMO_LEVELS.find(l => l.level === level);
}

/** Get speaker and listener names for a level */
export function getRolesForLevel(
  level: number,
  creatorName: string,
  joinerName: string
): { speakerName: string; listenerName: string } {
  const config = getLevelConfig(level);
  if (!config) {
    return { speakerName: creatorName, listenerName: joinerName };
  }

  // Level 5 is special - both paraphrase, but we need someone to go first
  // Creator goes first in Level 5
  if (config.isCommitmentLevel) {
    return { speakerName: creatorName, listenerName: joinerName };
  }

  return config.speakerRole === 'creator'
    ? { speakerName: creatorName, listenerName: joinerName }
    : { speakerName: joinerName, listenerName: creatorName };
}

/** Get the idea text for a level (pre-set for Level 5, null for others) */
export function getIdeaTextForLevel(level: number): string | undefined {
  const config = getLevelConfig(level);
  if (config?.isCommitmentLevel) {
    return LEVEL_5_COMMITMENT_TEXT;
  }
  return undefined;
}

/** Check if this is the final level */
export function isFinalLevel(level: number): boolean {
  return level === DEMO_LEVELS.length;
}

/** Get next level number (or null if done) */
export function getNextLevel(currentLevel: number): number | null {
  if (currentLevel >= DEMO_LEVELS.length) {
    return null;
  }
  return currentLevel + 1;
}
