import { lazy, Suspense, type ComponentProps } from 'react';
import type { PositionType } from '@/app/types';
import { getPositionGroup } from '@/app/utils/position-helpers';
import {
  readIntensityLearned,
  writeIntensityLearned,
  bumpIntensityPlainPicks,
  PLAIN_PICKS_BEFORE_TUTORIAL,
  INTENSITY_LEARNED_EVENT,
  INTENSITY_HINT_SHOWN_EVENT,
} from '@/hooks/use-intensity-learned';
import { analytics } from '@/lib/mixpanel';
import { readIntensityPreviewSeen, writeIntensityPreviewSeen } from '@/hooks/use-intensity-preview-seen';

// Lazy: the tutorial's demo renders PositionButtons itself, so a static import would be a
// module cycle (PositionButton → modal → pictogram → PositionButton). It also keeps the
// modal out of every page's initial bundle.
const IntensityTutorialModal = lazy(() =>
  import('@/app/components/letters/intensity-tutorial-modal').then((m) => ({ default: m.IntensityTutorialModal }))
);
import { Button } from '@/components/ui/button';
import { PositionButtons as PositionButtonsCore, type IntensityAdapter } from './presentational/position-buttons';
import { BUTTON_GROUPS, POSITION_LABELS } from './presentational/position-groups';

// P1445 D: the control itself lives in ./presentational/position-buttons (no product imports, so the
// Day board can render the same component). This file is CP's wrapper: it injects intensity
// learning (localStorage + window events), the lazy tutorial modal and analytics. Every CP call
// site imports PositionButtons from here, unchanged.
export type { SevenPointCounts, FivePointCounts } from './presentational/position-buttons';

const CP_INTENSITY: IntensityAdapter = {
  readLearned: readIntensityLearned,
  writeLearned: writeIntensityLearned,
  bumpPlainPicks: bumpIntensityPlainPicks,
  plainPicksBeforeTutorial: PLAIN_PICKS_BEFORE_TUTORIAL,
  readPreviewSeen: readIntensityPreviewSeen,
  writePreviewSeen: writeIntensityPreviewSeen,
  learnedEvent: INTENSITY_LEARNED_EVENT,
  hintShownEvent: INTENSITY_HINT_SHOWN_EVENT,
};
const track = (name: string, props: Record<string, unknown>) => analytics.track(name, props);
const renderTutorial = ({ trigger, onClose }: { trigger: 'hint-help' | 'plain-picks'; onClose: () => void }) => (
  <Suspense fallback={null}>
    <IntensityTutorialModal open dismissible trigger={trigger} onProceed={onClose} />
  </Suspense>
);

type CoreProps = ComponentProps<typeof PositionButtonsCore>;

// 3-button + explicit-clear menu (P847 Model C′) — CP's PositionButtons, with CP's injections.
export function PositionButtons(props: Omit<CoreProps, 'intensity' | 'onEvent' | 'renderTutorial'>) {
  return <PositionButtonsCore {...props} intensity={CP_INTENSITY} onEvent={track} renderTutorial={renderTutorial} />;
}

// Single position button (kept for backwards compatibility with existing code)
interface PositionButtonProps {
  position: PositionType;
  active: boolean;
  onClick: () => void;
  count: number;
}

export function PositionButton({
  position,
  active,
  onClick,
  count,
}: PositionButtonProps) {
  const group = getPositionGroup(position);
  const config = BUTTON_GROUPS[group];

  return (
    <Button
      onClick={onClick}
      variant="outline"
      size="sm"
      className={`rounded-full text-xs px-2.5 py-1 h-auto ${active ? config.activeClass : config.inactiveClass}`}
    >
      <span>{POSITION_LABELS[position]}</span>
      <span className={active ? 'opacity-90' : 'opacity-60'}>{count}</span>
    </Button>
  );
}

