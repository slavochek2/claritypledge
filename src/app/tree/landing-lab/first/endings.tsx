/**
 * The panel content of the endings. Every primary action sits in the footer's right slot
 * and is rendered by the shell: the two forms are submitted from there by id
 * (FORM_ID), which is why no form here has its own submit button.
 *
 * The pilot request and the event notifications submit nowhere in this prototype. The
 * footer button reads "Preview what would be sent" and the payload appears on the page; a
 * preview is never logged as a completed action.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import {
  StoryVideoPlayer,
  type StoryVideoPlayerHandle,
} from "@/app/components/shared/story-video-player";
import { LINKS, MEDIA } from "../content";
import { ROUTE_LABEL, TEXT, displayUrlParts } from "./copy";
import { FORM_ID } from "./formIds";
import { Heading } from "./Heading";
import type { InviteOutcome, PilotDraft } from "./invite";
import { CAPTION, LEAD, choiceButton, fieldInput, fieldLabel, note } from "./ui";

/** The story feed. */
export const FEED_PATH = "/feed";

function Preview({ rows }: { rows: [string, string][] }) {
  return (
    <section
      data-newest
      aria-live="polite"
      className="space-y-3 rounded-xl border border-slate-500 p-4"
      data-testid="first-preview"
    >
      <h2 className="text-[17px] font-semibold text-white">{TEXT.previewTitle}</h2>
      <dl className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className={CAPTION}>{label}</dt>
            <dd className="whitespace-pre-wrap break-words text-[17px] text-slate-50">
              {value.trim() ? value : TEXT.previewEmpty}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function WorkQuestion({ onAnswer }: { onAnswer: (canInvite: boolean) => void }) {
  return (
    <div data-newest className="first-enter space-y-5">
      <Heading role="title" text={TEXT.workQuestion} />
      <div className="space-y-3">
        <button type="button" className={choiceButton} onClick={() => onAnswer(true)}>
          {TEXT.workYes}
        </button>
        <button type="button" className={choiceButton} onClick={() => onAnswer(false)}>
          {TEXT.workNo}
        </button>
      </div>
    </div>
  );
}

const SIZES = [TEXT.workSize1, TEXT.workSize2, TEXT.workSize3, TEXT.workSize4, TEXT.workSize5];

export function PilotRequest({
  draft,
  onChange,
  onPreview,
}: {
  draft: PilotDraft;
  onChange: (d: PilotDraft) => void;
  onPreview: () => void;
}) {
  const id = useId();
  const [preview, setPreview] = useState<[string, string][] | null>(null);
  const set = (key: keyof PilotDraft) => (value: string) => {
    onChange({ ...draft, [key]: value });
    setPreview(null);
  };

  return (
    <div className="first-enter space-y-5">
      {/* The heading is a direct child of the screen, so it can stay pinned while the
          whole form scrolls under it. */}
      <Heading role="title" text={TEXT.workFormTitle} />
      <div data-newest className="space-y-1">
        <p className={LEAD}>{TEXT.workNoNames}</p>
        <p className={note}>{TEXT.workWhoReads}</p>
        <p className={note}>{TEXT.workRetention}</p>
      </div>
      <form
        id={FORM_ID.pilot}
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setPreview([
            [TEXT.workFieldConversation, draft.conversation],
            [TEXT.workFieldRoles, draft.roles],
            [TEXT.workFieldContact, draft.contact],
            [TEXT.workFieldSize, draft.size],
          ]);
          onPreview();
        }}
      >
        <div>
          <label className={fieldLabel} htmlFor={`${id}-conversation`}>
            {TEXT.workFieldConversation}
          </label>
          <textarea
            id={`${id}-conversation`}
            rows={4}
            value={draft.conversation}
            onChange={(e) => set("conversation")(e.target.value)}
            className={fieldInput}
          />
        </div>
        <div>
          <label className={fieldLabel} htmlFor={`${id}-roles`}>
            {TEXT.workFieldRoles}
          </label>
          <p id={`${id}-roles-hint`} className={`mt-1 ${CAPTION}`}>
            {TEXT.workFieldRolesHint}
          </p>
          <input
            id={`${id}-roles`}
            aria-describedby={`${id}-roles-hint`}
            value={draft.roles}
            onChange={(e) => set("roles")(e.target.value)}
            className={fieldInput}
          />
        </div>
        <div>
          <label className={fieldLabel} htmlFor={`${id}-contact`}>
            {TEXT.workFieldContact}
          </label>
          <input
            id={`${id}-contact`}
            autoComplete="email"
            value={draft.contact}
            onChange={(e) => set("contact")(e.target.value)}
            className={fieldInput}
          />
        </div>
        <div>
          <label className={fieldLabel} htmlFor={`${id}-size`}>
            {TEXT.workFieldSize}
          </label>
          <select
            id={`${id}-size`}
            value={draft.size}
            onChange={(e) => set("size")(e.target.value)}
            className={`${fieldInput} min-h-12`}
          >
            <option value="">{TEXT.workSizeNone}</option>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <p className={note}>{TEXT.workVoluntary}</p>
          <p className={note}>{TEXT.workPersonal}</p>
        </div>
      </form>
      {preview && <Preview rows={preview} />}
    </div>
  );
}

export function ForwardInvite({
  message,
  url,
  outcome,
}: {
  message: string;
  url: string;
  outcome: InviteOutcome | null;
}) {
  return (
    <div data-newest className="first-enter space-y-5">
      <Heading role="title" text={TEXT.workNoIntro} />
      <div data-testid="first-invite" className="space-y-2 rounded-xl border border-slate-600 bg-slate-950 p-4">
        <p className="text-[17px] leading-snug text-slate-50">{message}</p>
        {/* The link on its own line, without its protocol, breaking only after a slash. */}
        <p data-invite-link className={CAPTION}>
          {displayUrlParts(url).map((part, i) => (
            <span key={i}>
              <span className="whitespace-nowrap">{part}</span>
              <wbr />
            </span>
          ))}
        </p>
      </div>
      <p className={note}>{TEXT.inviteNoTopic}</p>
      <p aria-live="polite" className="text-[17px] text-slate-50">
        {outcome === "copied" && TEXT.inviteCopied}
        {outcome === "failed" && TEXT.inviteFailed}
      </p>
    </div>
  );
}

/** Ending 2. No heading: it would repeat the fork button the visitor just pressed. */
export function OnePerson() {
  return (
    <div data-newest className="first-enter">
      <Heading role="lead" text={TEXT.oneIntro} />
    </div>
  );
}

/**
 * Ending 3. "Yes, show me the next event" is itself the link to the events page; "No, I
 * am somewhere else" leads to the notifications form.
 */
export function RoomQuestion({ onElsewhere, onEvents }: { onElsewhere: () => void; onEvents: () => void }) {
  return (
    <div data-newest className="first-enter space-y-5">
      <Heading role="title" text={TEXT.roomQuestion} />
      <div className="space-y-3">
        <Link to={LINKS.events} className={choiceButton} onClick={onEvents}>
          {TEXT.roomChiangMai}
        </Link>
        <button type="button" className={choiceButton} onClick={onElsewhere}>
          {TEXT.roomElsewhere}
        </button>
      </div>
    </div>
  );
}

export function RoomElsewhere({ onPreview }: { onPreview: () => void }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState<[string, string][] | null>(null);
  return (
    <div className="first-enter space-y-5">
      <Heading role="title" text={ROUTE_LABEL.room} />
      <p data-newest className={LEAD}>
        {TEXT.roomElsewhereIntro}
      </p>
      <form
        id={FORM_ID.notify}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setPreview([[TEXT.roomEmail, email]]);
          onPreview();
        }}
      >
        <div>
          <label className={fieldLabel} htmlFor={`${id}-email`}>
            {TEXT.roomEmail}
          </label>
          <input
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setPreview(null);
            }}
            className={fieldInput}
          />
        </div>
      </form>
      {preview && <Preview rows={preview} />}
    </div>
  );
}

/**
 * Ending 4. No heading: it would repeat the fork button. A story card in a dark frame: the
 * film's 16:9 poster dimmed by a 35 percent black overlay, a white play mark at its
 * centre, and the label under it. Pressing it plays the film in place.
 */
export function Examples({ watching, onWatch }: { watching: boolean; onWatch: () => void }) {
  const playerRef = useRef<StoryVideoPlayerHandle>(null);

  // One press plays: seeking mounts the embed and starts playback, skipping the facade.
  useEffect(() => {
    if (watching) playerRef.current?.seekTo(0);
  }, [watching]);

  return (
    <div data-newest className="first-enter">
      {watching ? (
        <div data-first>
          <StoryVideoPlayer
            ref={playerRef}
            videoUrl={MEDIA.st1VideoUrl}
            posterUrl={MEDIA.st1PosterUrl}
            className="ring-1 ring-white/15"
          />
        </div>
      ) : (
        <button
          type="button"
          data-first
          onClick={onWatch}
          className="group block w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        >
          <span className="relative block aspect-video w-full bg-slate-900">
            <img src={MEDIA.st1PosterUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            <span aria-hidden="true" className="absolute inset-0 bg-black/35" />
            <span className="absolute inset-0 flex items-center justify-center">
              <Play aria-hidden="true" className="h-10 w-10 fill-white text-white drop-shadow" />
            </span>
          </span>
          <span className="block p-4 text-[17px] font-medium text-white">{TEXT.examplesFilm}</span>
        </button>
      )}
    </div>
  );
}
