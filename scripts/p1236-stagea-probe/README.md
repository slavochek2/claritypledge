# P1236 Stage A probe — one `getUserMedia` stream, two consumers

Answers the hardware precondition the P1236 build sequence gates everything on, and which
Decision 7 carried as `[UNVERIFIED]`: **can a `MediaStreamAudioSourceNode` and a
`MediaRecorder` both receive audio from the same `MediaStream` on the device this spec exists
because of?**

That device answered "no" to a *different* supported pattern — `SpeechRecognition` +
`MediaRecorder` ended at ~5.3 s with `heard=false`, fourteen consecutive times, with no error
of any kind. So the pattern being supported on paper was not evidence, and this probe exists
because the spec would otherwise have been built on an assumption that had already failed once
on that exact handset.

**Result: PASS, 2026-09-08.** See `measured-2026-09-08.txt` and Decision 7 in the spec.

## Why it is a within-run A/B

Seconds 1-8 run the Web Audio tap **alone** — the control. At second 8 the `MediaRecorder`
attaches to the same stream. Without that control phase a silent tap is ambiguous between "the
tap never worked" and "the recorder starved it", which is precisely the ambiguity the original
A/B had to resolve.

**Read the frame count, not the levels.** `tapFrames` rises 48000/second whenever the tap is
being served, independently of whether anyone is speaking; a starved tap shows up there
immediately. Levels track the speaker's pauses and appear quiet in both phases.

## Running it

```bash
adb devices                       # confirm the handset is attached
python3 scripts/p1236-stagea-probe/server.py &     # serves the page, collects POSTed log lines
adb reverse tcp:8899 tcp:8899     # phone's localhost:8899 -> this machine
adb shell am start -a android.intent.action.VIEW -d "http://localhost:8899/index.html" com.android.chrome
```

Then tap **START** on the phone, allow the microphone, and speak for ~20 seconds. Lines land in
`phone.log` next to the server — note `.gitignore` covers `*.log`, so a run you intend to
keep as evidence has to be renamed off that extension (this one is `.txt` for exactly that
reason; `git add <dir>` skipped the `.log` silently and the first commit of this probe carried
the harness without its measurement).

`localhost` over `adb reverse` is a secure context, so `getUserMedia` is available without TLS.

## Why the log comes back by POST rather than off the DevTools console

The spec's Stage A says "over the adb-forwarded DevTools console". Android Chrome's CDP would
not attach: `Target.getTargets` reported 2 live page targets against 62 in the `/json/list` HTTP
listing, and `Target.attachToTarget` hung on each. The page therefore POSTs each line back
through the same `adb reverse` tunnel. The bytes still originate on the physical device; only
the readout path differs.
