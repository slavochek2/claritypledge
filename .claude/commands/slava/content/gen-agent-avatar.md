---
name: gen-agent-avatar
description: Generate the avatar for an agent account — a robotified portrait of the subject that is recognizable as them and unmistakably not a photograph, verified at the sizes the product actually renders.
when_to_use: Whenever an agent account is created or its subject's avatar is regenerated. Every agent account must get its avatar through this skill — consistency across accounts is the reason it exists, and a hand-rolled prompt breaks it.
version: 1.0.0
---

# Generate Agent Avatar

Produce the avatar for an **agent account** — a persistent machine-assembled reading of one person, built from sources someone chose (`features/p1104_agents_must_be_visually_distinguishable.md`).

**Announce at start:** "Running /gen-agent-avatar."

The avatar must do two things at once:

1. **Be recognizable as the subject** — otherwise a reader cannot tell whose reading they are looking at, and the account may as well be an abstract glyph.
2. **Be unmistakably not a photograph of that person** — this is the whole reason the account is allowed to exist.

**Why this is a skill and not a prompt you write each time:** every agent account's avatar must look like it came from the same system. Two accounts robotified with two different prompts read as two unrelated art styles, and the marker stops being a marker. The prompt in Step 2 is **frozen** — treat it as a constant, not a starting point. Change it only by bumping this skill's `version`, and regenerate every existing avatar when you do.

---

## Usage

```
/slava:content:gen-agent-avatar "Subject Name" path/to/source-photo.jpg
/slava:content:gen-agent-avatar "Subject Name" https://example.org/portrait.jpg
```

---

## Step 0 — Rights check on the source photograph (blocking)

Do not proceed until the source is one of:

- **Public domain** — e.g. an official US government portrait (Wikimedia Commons states the licence).
- **The founder's own photograph**, or a photograph the subject supplied for this purpose (the claimed case).
- **Explicitly licensed** for this use.

If the source is a random image from a search result, **stop and say so**. Ask for a source that clears.

When downloading from Wikimedia, resolve the real file URL through the API and send a descriptive User-Agent — the direct thumb URL returns HTML to a bare curl:

```bash
curl -s "https://commons.wikimedia.org/w/api.php?action=query&titles=File:NAME.jpg&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=960&format=json" \
  | python3 -c "import sys,json;p=list(json.load(sys.stdin)['query']['pages'].values())[0]['imageinfo'][0];print(p['thumburl']);print(p['extmetadata'].get('LicenseShortName',{}).get('value','UNKNOWN LICENCE'))"

curl -sL -H "User-Agent: ClarityPledge/1.0 (ops@claritypledge.com)" -o /tmp/agent-src.jpg "<thumburl>"
```

**Read the licence line before continuing.** `UNKNOWN LICENCE` is a stop.

> **Product policy — decided 2026-08-19 (P1104).** Depicting a real public figure as a robotified avatar is acceptable **on one condition: the operator is named on the account's profile page from the moment the avatar is live.** A robot face carrying a position the subject never took, with no human named as answerable, is worse than a plain photograph with one.
>
> **This makes the condition part of this skill's contract.** Before emitting an avatar for a subject who is not the operator, confirm the profile page carries the operator line. If it does not, **stop and say so** — do not generate and leave the wiring to someone else.

---

## Step 1 — Square-crop the source

Faces off-centre produce off-centre robots. Crop to square around the head before generating:

```bash
sips -c 960 960 /tmp/agent-src.jpg --out /tmp/agent-src-sq.jpg    # centre crop
```

Check the result; recrop manually if the head is clipped.

---

## Step 2 — Generate (frozen prompt)

Uses Nano Banana image-to-image, the same family `/slava:content:gen-image` uses. Model chain: `gemini-3-pro-image-preview` → `gemini-3.1-flash-image-preview` → `gemini-2.5-flash-image`.

**The prompt below is frozen at skill version 1.0.0. Do not paraphrase, extend, or "improve" it per-subject.**

```python
PROMPT = (
 "Transform this portrait into a stylized ROBOT / ANDROID version of the same person. "
 "Requirements: (1) the person must stay RECOGNIZABLE - keep their distinctive facial "
 "proportions, hairstyle shape and head silhouette; (2) the result must be UNMISTAKABLY "
 "a machine, never mistakable for a photograph of a human: matte metal face plating with "
 "visible panel seams and joint lines, a glowing optical sensor in place of each eye, "
 "mechanical neck articulation; (3) FLAT GRAPHIC ILLUSTRATION style with bold simplified "
 "shapes and very strong light/dark contrast - NOT photorealistic, NOT a rendered 3D photo; "
 "(4) head and shoulders, centered, square composition, plain flat solid background with no "
 "scenery; (5) the silhouette and value contrast must stay readable when the image is scaled "
 "down to 20x20 pixels. Limited palette: cool slate greys plus one warm accent for the sensor eyes."
)
```

```python
import base64, json, os, sys, urllib.request

MODEL = os.environ.get("NB_MODEL", "gemini-3-pro-image-preview")
KEY = os.environ["GEMINI_API_KEY"]        # from .env.local

def robotify(src, dst):
    mime = "image/png" if src.lower().endswith(".png") else "image/jpeg"
    b64 = base64.b64encode(open(src, "rb").read()).decode()
    body = {
        "contents": [{"parts": [
            {"inline_data": {"mime_type": mime, "data": b64}},
            {"text": PROMPT},
        ]}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {"imageSize": "2K", "aspectRatio": "1:1"},
        },
    }
    req = urllib.request.Request(
        "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % MODEL,
        data=json.dumps(body).encode(),
        headers={"x-goog-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        out = json.load(r)
    for p in out["candidates"][0]["content"]["parts"]:
        if "inlineData" in p:
            open(dst, "wb").write(base64.b64decode(p["inlineData"]["data"]))
            return dst
    raise SystemExit("no image in response: " + json.dumps(out)[:600])
```

Load the key with `set -a; source .env.local; set +a` — never inline it.

---

## Step 3 — The size gate (blocking, and the point of this skill)

**A generated image is not accepted until it has been checked at the sizes the product renders.** Measured 2026-08-19: a robotified portrait is unmistakably a machine at 96px, still clearly one at 40px, and **indistinguishable from the source photograph at 20px** — the panel seams and sensor eyes fall below the pixel grid. That is expected and is why the square silhouette exists. What the gate catches is a *different* failure: a generation so photographic that it fails at 40px too.

```bash
for s in 20 40 96 192; do sips -Z $s agent-robot.png --out check-$s.png >/dev/null; done
for s in 20 40; do sips -Z $((s*6)) check-$s.png --out check-$s-mag.png >/dev/null; done
```

Then **look at `check-40.png` and `check-96.png`** and confirm all of:

- [ ] At **96px** — reads as a machine at a glance, and is recognizably the subject
- [ ] At **40px** — still reads as a machine, not as a person with an odd photo
- [ ] Value contrast is strong; it does not turn into flat mush when downscaled
- [ ] Background is a plain solid, no scenery bleeding into the silhouette
- [ ] It is square and the head is centred and not clipped

**Failing at 40px is a regenerate, not a shrug.** Re-run Step 2 (the model is non-deterministic; a second pass usually fixes it). If three passes fail at 40px, report that rather than shipping the best of three — the prompt may need a version bump, which is a deliberate change, not a per-subject fix.

Mechanical sanity check that the robotification actually happened — a near-identical result means the model returned the source largely untouched. Uses `ffmpeg` (already installed; Pillow is **not** on this machine, do not reach for it):

```bash
ssim() {
  ffmpeg -i "$1" -i "$2" -lavfi \
    "[0:v]scale=256:256,format=gray[a];[1:v]scale=256:256,format=gray[b];[a][b]ssim" \
    -f null - 2>&1 | grep -oE "All:[0-9.]+" | head -1 | cut -d: -f2
}
ssim /tmp/agent-src-sq.jpg agent-robot.png
```

**Threshold: SSIM < 0.6 passes.** Measured 2026-08-19 on this exact command:

| Case | SSIM | Verdict |
|---|---|---|
| Robotified vs source (subject 1) | 0.21 | pass |
| Robotified vs source (subject 2) | 0.36 | pass |
| Source vs a plain resize of itself | 0.96 | **caught** |
| Source vs itself | 1.00 | **caught** |

Both the passing and the failing path were exercised before this threshold was written down — the failure rows are what make the number trustworthy, not the passing ones.

Note the SSIM output goes to **stderr** and the `All:` token only appears with the filter's default logging, which is why the redirect and the `grep -oE` are both load-bearing. A silently empty result is a broken command, not a passing check — if `ssim` prints nothing, fix the command rather than continuing.

---

## Step 4 — Emit the asset

Agent avatars are **static assets, not database rows.** This mirrors P1104's fail-closed decision: the same application-code constant that identifies an agent account also names its avatar, so there is no column that can return `undefined` and no upload pipeline that can be half-run.

```bash
mkdir -p public/agents
sips -Z 512 agent-robot.png --out public/agents/{slug}.png
```

- `{slug}` — lowercase, hyphenated subject name (`donald-trump`, `slava-ladischenski`)
- 512px is enough for every render site (largest current avatar is 96px, `xl`)
- PNG, square, no transparency

Register it beside the account id in the agent constant module, and set the display name to the P1104 form:

```
Agent · {Subject Name}
```

**Never** a bare person's name, and **never** a trailing marker — `{Subject} (agent)` truncates away to a bare name on a 320px row (measured, P1104).

---

## Step 5 — Report

State plainly:

- The source photograph and its licence
- Which model produced the accepted image, and how many passes it took
- The mean-difference number from Step 3
- **Paste the 40px and 96px renders** — the gate is evidence, not a claim
- Whether the subject is a public figure with the policy question still open

---

## Reference set

The first two avatars generated with this prompt (2026-08-19, `gemini-3-pro-image-preview`) are the visual reference — see the P1104 marker calibration plate. Target properties, in words, for when no reference image is at hand:

- **Cool slate greys**, matte, with warm amber sensor eyes as the only saturated colour
- **Flat graphic illustration**, hard-edged, high contrast — not a 3D render, not painterly
- **Panel seams read as deliberate lines**, not texture noise
- The subject's **hair silhouette and jaw line survive** — that is what carries recognition

Once the first agent accounts ship, `public/agents/` **is** the reference set. Match it.

---

## Related

- `features/p1104_agents_must_be_visually_distinguishable.md` — why the avatar exists, the three-channel design, the 20px measurement
- `/slava:content:gen-image` — general-purpose image generation (Postiz-bound); shares the Nano Banana mechanics, different purpose
- `.claude/rules/pii.md` — public figures vs private individuals
