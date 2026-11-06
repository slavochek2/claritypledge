/**
 * @file canvas-box.tsx
 * @description One box of the canvas. D3, R2: a title with its outline icon and its first card, "See all N" for the rest. P1536: on the owner's draft an empty box shows the question the
 * drafting agent left for the owner. P1621: on the owner's canvas a box can be SELECTED, which is how it shows its actions: Mention in chat at the top right; on the owner's open draft
 * also Edit and Open on its first card, Add card under it (a new-card editor opens straight away in an empty box) and See all N in place. At rest a box shows words only, plus a quiet
 * "Unsaved text" label when typed text is waiting. Readers and published versions keep today's boxes: no selection, whole-card buttons, See all opens the panel.
 */
import type { ReactNode } from 'react';
import type { CanvasBoxTag } from '@/lib/canvas-boxes';
import type { PointWithUserPosition } from '@/app/types';
import { BoxCardContext } from './canvas-box-card-context';
import { CanvasBoxBody } from './canvas-box-body';
import { CanvasBoxFooter } from './canvas-box-footer';
import { boxHasOwnMention, boxOutline } from './canvas-box-model';
import { BoxTitle } from './canvas-box-title';
import { useFocusRequest } from './canvas-focus-request';
import { MentionInChatButton } from './canvas-mention-in-chat';
import { UNSAVED_TEXT_LABEL } from './canvas-new-card-copy';
import { CanvasNewCardEditor } from './canvas-new-card-editor';
import type { PointEditConfig } from './canvas-point-edit';
import { CANVAS_CHIP } from './canvas-pill-styles';
import { useBoxEditor, type BoxSelectionProps } from './use-box-editor';

export type { BoxSelectionProps };

export function CanvasBox({ tag, title, points, renderCard, onMore, question, changed, edit, openDraftId, canvasId, selection }: {
  tag: CanvasBoxTag;
  title: string;
  /** null while loading (skeleton) */
  points: PointWithUserPosition[] | null;
  renderCard: (point: PointWithUserPosition) => ReactNode;
  onMore: () => void;
  question?: string;
  changed: boolean;
  /** the owner's open draft only */
  edit?: PointEditConfig;
  /** the owner's open draft even when a published version is on screen (what "gone" is measured against) */
  openDraftId?: string | null;
  /** the canvas on screen (its unsaved text is what "gone" is measured for) */
  canvasId?: string;
  selection: BoxSelectionProps;
}) {
  const { selectable, selected, onToggle } = selection;
  const box = useBoxEditor(tag, points, edit, selection, onMore);
  const { flags } = box;
  useFocusRequest();
  const headingId = `canvas-box-${tag.replace(':', '-')}`;
  const editor = box.editorVisible && edit
    ? <CanvasNewCardEditor tag={tag} edit={edit} count={flags.count} autoFocus={box.autoFocus} onSaved={box.savedCard} onCancel={box.cancelEditor} onEscape={box.escapeEditor} />
    : null;
  return (
    // The click and Escape handlers are a mouse and touch convenience on top of the title button (a real button: Enter or Space selects), never the only way in.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      ref={box.sectionRef}
      aria-labelledby={headingId}
      data-testid={`canvas-box-${tag}`}
      data-canvas-box
      data-empty={flags.empty || undefined}
      data-selected={selected || undefined}
      onClick={box.onSectionClick}
      onKeyDown={box.onSectionKey}
      // Founder (fifth round): white on white hid everything — a grey box holds white cards.
      className={`flex min-w-0 flex-col rounded-xl border bg-muted/60 p-2 transition-colors data-[highlight]:ring-2 data-[highlight]:ring-blue-500 sm:p-2.5 ${boxOutline(selected, selectable)}`}
    >
      <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-x-2">
        <BoxTitle tag={tag} title={title} headingId={headingId} empty={flags.empty} selectable={selectable} selected={selected} onToggle={onToggle} buttonRef={box.titleRef} />
        {/* Round 2: where the cards carry their own Mention in chat (the draft, a pending Clone), the box keeps its own only while it is empty. */}
        {boxHasOwnMention(selected, edit, points) && <MentionInChatButton tag={tag} title={title} />}
        {!selected && flags.hasText && <span className="ml-auto text-xs text-foreground/60" data-testid="canvas-box-unsaved">{UNSAVED_TEXT_LABEL}</span>}
      </div>
      {changed && (
        // 3c X12: changed = differs from the version the draft started from. A box the base had and an update emptied reads Empty with Removed (hiding it would hide a removal before Publish); any other changed box reads Changed. On its own line under the header (the wireframes'), so a narrow header keeps its title whole.
        <span className={`mb-1.5 self-start ${CANVAS_CHIP}`} data-testid={flags.empty ? 'canvas-box-removed' : 'canvas-box-changed'}>{flags.empty ? 'Removed' : 'Changed'}</span>
      )}
      <BoxCardContext.Provider value={box.cardValue}>
        <CanvasBoxBody tag={tag} points={points} edit={edit} renderCard={renderCard} expanded={box.expanded} question={question} editorVisible={box.editorVisible} editor={editor} showGone={selectable} openDraftId={openDraftId} canvasId={canvasId} />
      </BoxCardContext.Provider>
      {points !== null && !flags.empty && <CanvasBoxFooter tag={tag} showAdd={box.showAdd} onAdd={box.onAdd} full={box.showFull} toggle={box.toggle} />}
    </section>
  );
}
