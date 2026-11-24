/**
 * @file MeetingStakes.tsx
 * Prototype at /tree/meeting-stakes (P1721, design exploration, DEV-only).
 *
 * A meeting host picks one of their meetings, rates it on the five conditions,
 * and sees (1) whether a check of understanding is worth it and (2) what the
 * check has to catch to pay for its own overhead. Meetings can be collected
 * into a list with yearly totals.
 *
 * WHERE THE CONTENT COMES FROM. The gate question and the five conditions are
 * docs/arbiter-failure-model.md; the meeting list and each meeting's usual
 * pattern are docs/high-stakes-examples.md. This file holds a prototype copy of
 * both. If the prototype is adopted, read them from one place.
 *
 * NO NUMBER HERE IS A FINDING. Unlike the key-hire calculator there is no
 * study behind any figure: every number is the visitor's own estimate, and the
 * page says so. That is why the money section leads with a break-even ("pays
 * for itself if it catches one in N") and never with a savings claim: we have
 * no measured rate at which the check catches anything.
 *
 * [FOUNDER DECISION: all copy, the verdict thresholds, and the default numbers
 * are agent-proposed placeholders.]
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ALL_MEETINGS, CONDITIONS, MEETINGS, MONEY_DEFAULTS, NONE, VERDICT, compute, verdictOf, type Level, type Money, type Ratings, type Saved } from "./model";
import { CARD, Choices, FIELD, Profile } from "./parts";
import { MoneySection } from "./MoneySection";
import { SavedList } from "./SavedList";

export function MeetingStakes() {
  const [meeting, setMeeting] = useState(ALL_MEETINGS[0].name);
  const [depends, setDepends] = useState(true);
  const [ratings, setRatings] = useState<Ratings>(ALL_MEETINGS[0].usual);
  const [money, setMoney] = useState<Money>(MONEY_DEFAULTS);
  const [saved, setSaved] = useState<Saved[]>([]);

  const verdict = verdictOf(depends, ratings);
  const { checkPerYear, atRiskPerYear } = compute(money);

  const pickMeeting = (name: string) => {
    setMeeting(name);
    setRatings(ALL_MEETINGS.find((m) => m.name === name)?.usual ?? NONE);
    setDepends(true);
  };

  const save = () =>
    setSaved((s) => [...s, { id: Date.now(), name: meeting, verdict, perYear: money.perYear, checkPerYear, atRiskPerYear }]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-foreground sm:py-14">
      <Link to="/tree" className="text-sm text-blue-600 hover:underline">← Prototypes</Link>

      <header className="mt-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Is this meeting worth a check?</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          ClarityPledge is for high-stakes meetings, like a kickoff, where success depends on shared understanding. A gap in
          understanding gets more dangerous the fuzzier the intent behind a decision, the later its results show up, the more
          damage it can do, the harder it is to undo, and the more each side explains the results its own way. ClarityPledge
          gives the meeting host a way to check.
        </p>
      </header>

      <section className={`${CARD} mt-8`} aria-labelledby="s1">
        <h2 id="s1" className="text-xl font-semibold">1. Pick one of your meetings</h2>
        <label className="mt-4 block">
          <span className="mb-1 block text-sm text-muted-foreground">Meeting or decision</span>
          <select value={meeting} onChange={(e) => pickMeeting(e.target.value)} className={FIELD}>
            {MEETINGS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <p className="mt-6 font-medium">If two people left this meeting with different readings of it, would the result suffer?</p>
        <div className="mt-3">
          <Choices label="Would the result suffer" options={["Yes", "Not really"]} value={depends ? 0 : 1} onChange={(i) => setDepends(i === 0)} />
        </div>
      </section>

      {depends && (
        <section className={`${CARD} mt-6`} aria-labelledby="s2">
          <h2 id="s2" className="text-xl font-semibold">2. Rate your meeting</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The answers start at what is usual for this kind of meeting. Change them to fit yours.
          </p>
          <div className="mt-5 grid gap-6">
            {CONDITIONS.map((c) => (
              <div key={c.key}>
                <p className="font-medium">{c.question}</p>
                <div className="mt-2">
                  <Choices label={c.question} options={c.options} value={ratings[c.key]} onChange={(i) => setRatings((r) => ({ ...r, [c.key]: i as Level }))} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 rounded-xl border-2 border-blue-600 bg-blue-500/5 p-5 sm:p-6" aria-live="polite" aria-labelledby="verdict">
        <p className="text-sm text-muted-foreground">{meeting}</p>
        <h2 id="verdict" className="mt-1 text-2xl font-semibold">{VERDICT[verdict].title}</h2>
        <p className="mt-2">{VERDICT[verdict].body}</p>
        {depends && <Profile ratings={ratings} />}
      </section>

      <MoneySection money={money} setMoney={setMoney} onSave={save} />

      {saved.length > 0 && <SavedList saved={saved} onRemove={(id) => setSaved((all) => all.filter((x) => x.id !== id))} />}
    </main>
  );
}
