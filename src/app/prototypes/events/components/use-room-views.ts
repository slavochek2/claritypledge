/**
 * @file use-room-views.ts
 * @description The event room's in-page views, each shown on the same /meet path (LazyRoute keys on the pathname
 * only, so the page does not remount):
 *  - ?view=learn — the learning (round 8b; only a recipe with in-room learning honours it, so it can never hide the
 *    room — round 8d, Codex MED 4); &then=join when a non-learner's Join started it (it ends on the group terms);
 *  - ?view=feedback — the close flow (P1542 founder UAT round: "Share feedback" opens inside the room, the way Learn
 *    does), with &join=1 for the thank-you's group terms.
 *
 * One history model (P1542 review round, G1/G4/C4):
 *  - opening a view from the plain room PUSHES one entry, counted in the route state (`roomDepth`, round 8c) and marked
 *    `pushedView`; every other mark the room was opened with (fromEvent, fromReady — P1562) is kept, so "Back to the
 *    event" and "Back to readiness" return past the room's entries in one traversal;
 *  - moving from one view to another REPLACES that entry (no stacking: Learn from the feedback is still one entry);
 *  - leaving a view by a room tab REPLACES it with the plain room (deterministic: no async pop racing the chosen step);
 *    the entry stays, so its count stays true;
 *  - a view's own Back (the close's first question, a non-attendee bounced out) POPS the entry it pushed, so browser
 *    Back afterwards leaves the room; on a cold entry (nothing was pushed) it replaces with the plain room.
 */
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

type RoomViewState = { roomDepth?: number; pushedView?: boolean; joinViaLearning?: boolean } & Record<string, unknown>;

/** The room's own marks, without a view entry's: what the plain room keeps when a view is left. */
function plainRoomState(state: RoomViewState): RoomViewState {
  const { pushedView: _pushed, joinViaLearning: _via, ...rest } = state;
  return rest;
}

export function useRoomViews(learnsInBar: boolean) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const view = searchParams.get('view');
  const learning = learnsInBar && view === 'learn';
  const feedback = view === 'feedback';
  const inView = learning || feedback;
  const learnThenJoin = learning && searchParams.get('then') === 'join';
  const roomState = (location.state ?? {}) as RoomViewState;
  const roomDepth = typeof roomState.roomDepth === 'number' ? roomState.roomDepth : 0;
  const show = (search: string, extra: Record<string, unknown> = {}) => {
    if (inView) navigate({ search }, { replace: true, state: { ...plainRoomState(roomState), pushedView: roomState.pushedView, ...extra } });
    else navigate({ search }, { state: { ...roomState, ...extra, roomDepth: roomDepth + 1, pushedView: true } });
    window.scrollTo(0, 0);
  };
  /** `thenJoin`: a non-learner's Join — the learning ends on the group terms (in the room, P1542 review G3). */
  const openLearn = (thenJoin = false) => {
    if (!learning || thenJoin !== learnThenJoin) show(thenJoin ? '?view=learn&then=join' : '?view=learn');
  };
  /** `join`: the thank-you's group terms; `viaLearning`: reached through the learning (step 2 of joining). */
  const openFeedback = (join = false, viaLearning = false) => {
    if (!feedback || join) show(join ? '?view=feedback&join=1' : '?view=feedback', viaLearning ? { joinViaLearning: true } : {});
  };
  const leaveView = () => {
    if (!inView) return;
    navigate({ search: '' }, { replace: true, state: plainRoomState(roomState) });
    window.scrollTo(0, 0);
  };
  const backFromView = () => {
    if (!inView) return;
    if (roomState.pushedView === true) navigate(-1);
    else navigate({ search: '' }, { replace: true, state: plainRoomState(roomState) });
    window.scrollTo(0, 0);
  };
  return { learning, feedback, learnThenJoin, openLearn, openFeedback, leaveView, backFromView };
}
