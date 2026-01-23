// Types for Ideas Stories UI (Instagram Stories-inspired)

export type Position = 'agree' | 'disagree' | 'unsure' | null;

export interface Author {
  id: string;
  name: string;
  avatar: string;
}

export interface StoryIdea {
  id: string;
  text: string;
  author: Author;
  myPosition: Position;
  partnerPosition: Position;
  isVerified: boolean;
  timestamp: string;
}

export interface IdeasStoriesProps {
  ideas: StoryIdea[];
  startIndex?: number;
  pendingVerificationRequest?: string; // ideaId if partner requested verification
  onPositionChange: (ideaId: string, position: Position) => void;
  onVerify: (ideaId: string) => void;
  onRespondToVerification?: (ideaId: string) => void;
  onAddIdea: () => void;
  onInsertFromProfile?: () => void;
  onClose: () => void;
}

export interface ProgressBarProps {
  total: number;
  current: number;
}

export interface StoryCardProps {
  idea: StoryIdea;
  onPositionChange: (position: Position) => void;
  onVerify: () => void;
}

export interface PositionPollProps {
  currentPosition: Position;
  onChange: (position: Position) => void;
}

// Status for history view
export type IdeaStatus = 'pending' | 'divergent' | 'verified';

export function getIdeaStatus(idea: StoryIdea): IdeaStatus {
  if (idea.isVerified) return 'verified';
  if (
    idea.myPosition &&
    idea.partnerPosition &&
    idea.myPosition !== idea.partnerPosition
  ) {
    return 'divergent';
  }
  return 'pending';
}

export function hasDivergentPositions(idea: StoryIdea): boolean {
  return (
    idea.myPosition !== null &&
    idea.partnerPosition !== null &&
    idea.myPosition !== idea.partnerPosition
  );
}
