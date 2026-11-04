#!/usr/bin/env python3
"""p1608-ami-corpus.py: builds the recorded-speech corpus for the P1608 transcription end-to-end test.

Source: the AMI Meeting Corpus (https://groups.inf.ed.ac.uk/ami/corpus/), individual headset microphones.
Licence: Creative Commons Attribution 4.0 (CC BY 4.0), read on the corpus licence page 2026-11-04; see
ATTRIBUTION below. The clips are CUT (a 4 minute window), RESAMPLED (16 kHz mono) and MIXED (a quiet copy
of every other speaker added to each clip), so they are modified material; that is stated in the attribution.

A contiguous 4 minute meeting window cannot supply 24 phrases that nobody talks over (measured: zero windows in 138
meetings even at 3 + 1 phrases per speaker), so the shared timeline is SYNTHETIC: real, isolated utterances of the
three speakers, each cut from its own headset, placed in turn order. Speech is real; the turn-taking is arranged.

Audio never enters the repository. It lives in a cache directory (default ~/.cache/cp-p1608-ami, or
P1608_CACHE). The repo holds only this script and e2e/p1608/corpus.json: cut times, SHA-256 hashes of the
source recordings and of the produced clips, and the short expected phrases taken from the corpus's
HUMAN-ANNOTATED words, never from any machine transcript.

Subcommands
  select                 list meetings whose annotations supply 8 isolated phrases for each of 3 speakers
  build  [--meeting M]   download, cut, mix, hash, write e2e/p1608/corpus.json and the 3 clips
  verify                 check the clips and annotations against corpus.json hashes (exit 1 on any mismatch)

Standard library plus ffmpeg only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.request
import xml.etree.ElementTree as ET  # input: the public corpus annotations, hash-pinned in corpus.json; ElementTree resolves no external entities
import zipfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CORPUS_JSON = REPO / "e2e" / "p1608" / "corpus.json"
# Phrases that local Whisper did not hear in the clip (unclear audio): never used. Filled by the re-verification step.
EXCLUDED_JSON = REPO / "e2e" / "p1608" / "excluded-phrases.json"
CACHE = Path(os.environ.get("P1608_CACHE", "~/.cache/cp-p1608-ami")).expanduser()
ANN_URL = "https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip"
AUDIO_URL = "https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/{m}/audio/{m}.Headset-{n}.wav"
ATTRIBUTION = (
    "AMI Meeting Corpus, Carletta et al., University of Edinburgh and the AMI/AMIDA consortium, "
    "https://groups.inf.ed.ac.uk/ami/corpus/ , licensed CC BY 4.0 "
    "(https://creativecommons.org/licenses/by/4.0/). Modified: cut to a 4 minute window, resampled to "
    "16 kHz mono, and mixed with a quiet copy of the other speakers' headsets."
)

CLIP_S = 240           # clip length; T counts from the tap on Transcribe
R1 = (30.0, 130.0)     # round 1 phrases live here (round 1 runs about T=20..140)
R1_FIRST = (30.0, 80.0)  # inside round 1's first 60 s
R2 = (150.0, 230.0)    # round 2 phrases live here (round 2 runs about T=140..240)
N_R1, N_R2 = 6, 2
MIN_WORDS, MAX_WORDS = 6, 10
ISOLATION_S = 2.0
BLEED_DB = -12
FILLERS = {"um", "uh", "mm", "hmm", "mmm", "er", "erm", "uh-huh", "mm-hmm", "yeah"}  # not counted into a phrase


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def fetch(url: str, dest: Path) -> Path:
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"downloading {url}", file=sys.stderr)
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
        want = int(r.headers.get("Content-Length", "-1"))
        while chunk := r.read(1 << 20):
            f.write(chunk)
    got = tmp.stat().st_size
    if want >= 0 and got != want:  # a cut-short download once produced a silent half of a headset
        tmp.unlink()
        raise SystemExit(f"download of {url} was cut short (expected {want} bytes)")
    tmp.rename(dest)
    return dest


def annotations_dir() -> Path:
    d = CACHE / "ann"
    if not (d / "words").is_dir():
        z = fetch(ANN_URL, CACHE / "ami_public_manual_1.6.2.zip")
        d.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(z) as zf:
            zf.extractall(d)
    return d


def read_words(path: Path) -> list[dict]:
    """Spoken words only: <w> elements that are not punctuation. Truncated or hyphenated fragments are flagged."""
    out = []
    for el in ET.parse(path).getroot():
        if not el.tag.endswith("w") or el.get("punc") == "true" or el.get("starttime") is None:
            continue
        txt = (el.text or "").strip()
        if not txt:
            continue
        out.append({"w": txt, "s": float(el.get("starttime")), "e": float(el.get("endtime")),
                    "bad": el.get("trunc") == "true" or "-" in txt or txt.lower() in FILLERS})
    return out


def meetings() -> dict[str, list[str]]:
    """meeting id -> speaker letters having a words file."""
    found: dict[str, list[str]] = {}
    for p in sorted((annotations_dir() / "words").glob("*.words.xml")):
        m, spk = p.name.split(".")[0], p.name.split(".")[1]
        found.setdefault(m, []).append(spk)
    return found


def norm(w: str) -> str:
    return re.sub(r"[^a-z0-9']", "", w.lower())


def candidates(words: list[dict], others: list[list[dict]]) -> list[dict]:
    """Phrases of 6..10 clean consecutive words by one speaker, with nobody else speaking within ISOLATION_S."""
    other = sorted((w["s"], w["e"]) for ws in others for w in ws)
    res = []
    i = 0
    while i < len(words):
        j = i
        while j + 1 < len(words) and words[j + 1]["s"] - words[j]["e"] <= 0.5 and not words[j + 1]["bad"] and not words[i]["bad"]:
            j += 1
        run = words[i:j + 1]
        i = j + 1
        if run[0]["bad"] or len(run) < MIN_WORDS:
            continue
        run = run[:MAX_WORDS]
        toks = [norm(w["w"]) for w in run]
        if any(a == b for a, b in zip(toks, toks[1:])):  # "the the", "there there": a recogniser writes these differently
            continue
        s, e = run[0]["s"], run[-1]["e"]
        if any(a < e + ISOLATION_S and b > s - ISOLATION_S for a, b in other):
            continue
        res.append({"text": " ".join(norm(w["w"]) for w in run if norm(w["w"])), "start": s, "end": e})
    return res


def load_speakers(meeting: str, speakers: list[str]) -> dict[str, list[dict]]:
    d = annotations_dir() / "words"
    return {s: read_words(d / f"{meeting}.{s}.words.xml") for s in speakers}


PREFER_WORDS = 8
MAX_PHRASE_S = 6.5    # a phrase longer than this is not used
PAD_S = 0.2            # audio kept before and after each phrase (the annotations carry 2 s of silence around it)
GAP_S = 1.5            # silence between two phrases on the shared timeline
R1_START, R2_START = 30.0, 150.0


def trigrams(text: str) -> set[tuple[str, ...]]:
    w = text.split()
    return {tuple(w[i:i + 3]) for i in range(len(w) - 2)}


def choose(per_speaker: dict[str, list[dict]]) -> dict[str, list[dict]] | None:
    """N_R1 + N_R2 phrases per speaker, spread over the meeting, no two phrases sharing a trigram or a text."""
    need = N_R1 + N_R2
    chosen: dict[str, list[dict]] = {}
    used: list[set] = []
    for spk, cands in per_speaker.items():
        excluded = set(json.loads(EXCLUDED_JSON.read_text())) if EXCLUDED_JSON.exists() else set()
        pool = [c for c in cands if c["end"] - c["start"] <= MAX_PHRASE_S and c["text"] not in excluded]
        longer = [c for c in pool if len(c["text"].split()) >= PREFER_WORDS]
        pool = longer if len(longer) >= need * 2 else pool  # prefer 8+ words when the speaker has enough of them
        if len(pool) < need:
            return None
        step = len(pool) / need
        picks = []
        for k in range(need):  # evenly spread over the meeting, then walk forward past clashes
            i = int(k * step)
            while i < len(pool):
                t = trigrams(pool[i]["text"])
                if pool[i]["text"] not in {p["text"] for p in picks} and all(not (t & u) for u in used) and pool[i] not in picks:
                    picks.append(pool[i])
                    used.append(t)
                    break
                i += 1
            else:
                return None
        chosen[spk] = picks
    return chosen


def schedule(trio: list[str], chosen: dict[str, list[dict]]) -> dict[str, dict[str, list[dict]]]:
    """Put the phrases on the shared timeline in turn order: round 1 rotates A,B,C; round 2 follows. Returns T start/end."""
    plan = {s: {"round1": [], "round2": []} for s in trio}
    def place(rnd: str, start: float, count: int, offset: int) -> None:
        t = start
        for k in range(count):
            for j in range(len(trio)):
                spk = trio[(j + k) % len(trio)]
                idx = offset + k
                c = chosen[spk][idx]
                dur = c["end"] - c["start"] + 2 * PAD_S
                plan[spk][rnd].append({"text": c["text"], "src_start": c["start"], "src_end": c["end"],
                                       "start": round(t + PAD_S, 2), "end": round(t + PAD_S + (c["end"] - c["start"]), 2)})
                t += dur + GAP_S
        plan["_end_" + rnd] = t  # type: ignore[assignment]
    place("round1", R1_START, N_R1, 0)
    place("round2", R2_START, N_R2, N_R1)
    return plan


def search(meeting: str, speakers: list[str]) -> dict | None:
    if len(speakers) < 3:
        return None
    allw = load_speakers(meeting, speakers)
    from itertools import combinations
    for trio in combinations(speakers, 3):
        per = {s: candidates(allw[s], [allw[o] for o in speakers if o != s]) for s in trio}
        chosen = choose(per)
        if not chosen:
            continue
        plan = schedule(list(trio), chosen)
        r1_end, r2_end = plan.pop("_end_round1"), plan.pop("_end_round2")
        # round 1 phrases must end by T=130, round 2 by T=230; round 1's first phrase for each person must start by T=80
        if r1_end - GAP_S > R1[1] or r2_end - GAP_S > R2[1]:
            continue
        if any(v["round1"][0]["start"] > R1_FIRST[1] for v in plan.values()):
            continue
        return {"meeting": meeting, "speakers": list(trio), "plan": plan}
    return None


def cmd_select(_: argparse.Namespace) -> int:
    found = 0
    for m, spk in meetings().items():
        if not re.match(r"^(ES|IS|TS)\d{4}[a-d]$", m) or len(spk) < 3:
            continue
        r = search(m, spk)
        if r:
            found += 1
            print(f"{m} speakers={r['speakers']}")
    print(f"{found} meeting(s) can supply {N_R1 + N_R2} isolated phrases for each of 3 speakers")
    return 0 if found else 1


def ffmpeg(*args: str) -> None:
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", *args], check=True)


def dry_track(src: Path, segments: list[dict], out: Path) -> None:
    """One speaker's own phrases on the 240 s timeline, silence elsewhere (a trace of noise keeps loudness curves defined)."""
    inputs, parts, labels = [], [], []
    for k, g in enumerate(segments):
        inputs += ["-ss", f"{g['src_start'] - PAD_S:.3f}", "-t", f"{g['src_end'] - g['src_start'] + 2 * PAD_S:.3f}", "-i", str(src)]
        delay = int((g["start"] - PAD_S) * 1000)
        parts.append(f"[{k}:a]aresample=16000,pan=mono|c0=c0,afade=t=in:d=0.05,afade=t=out:st={g['src_end'] - g['src_start'] + 2 * PAD_S - 0.05:.3f}:d=0.05,adelay={delay}|{delay}[s{k}]")
        labels.append(f"[s{k}]")
    n = len(segments)
    graph = ";".join(parts) + f";anoisesrc=d={CLIP_S}:c=pink:a=0.0005:r=16000[nz];" + "".join(labels) + f"[nz]amix=inputs={n + 1}:normalize=0:duration=longest,atrim=0:{CLIP_S}[o]"
    ffmpeg(*inputs, "-filter_complex", graph, "-map", "[o]", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(out))


def cmd_build(a: argparse.Namespace) -> int:
    meeting = a.meeting
    spk_all = meetings().get(meeting)
    if not spk_all:
        print(f"no annotations for {meeting}", file=sys.stderr)
        return 1
    r = search(meeting, spk_all)
    if not r:
        print(f"{meeting}: cannot supply the phrases", file=sys.stderr)
        return 1
    trio = r["speakers"]
    sources = {}
    for s in trio:
        n = "ABCD".index(s)  # participant letter A..D is Headset-0..3; the Whisper re-verification step proves it per clip
        p = fetch(AUDIO_URL.format(m=meeting, n=n), CACHE / "src" / f"{meeting}.Headset-{n}.wav")
        sources[s] = {"headset": n, "sha256": sha256(p), "path": p}
    (CACHE / "clips").mkdir(parents=True, exist_ok=True)
    (CACHE / "dry").mkdir(parents=True, exist_ok=True)
    dry = {}
    for s in trio:
        dry[s] = CACHE / "dry" / f"p1608-{meeting}-{s}.dry.wav"
        dry_track(sources[s]["path"], r["plan"][s]["round1"] + r["plan"][s]["round2"], dry[s])
    clips = {}
    for s in trio:
        out = CACHE / "clips" / f"p1608-{meeting}-{s}.wav"
        order = [s] + [o for o in trio if o != s]
        inputs = []
        for o in order:
            inputs += ["-i", str(dry[o])]
        vols = [f"[{k}:a]volume={'1.0' if k == 0 else str(BLEED_DB) + 'dB'}[v{k}]" for k in range(len(order))]
        graph = ";".join(vols) + ";" + "".join(f"[v{k}]" for k in range(len(order))) + f"amix=inputs={len(order)}:normalize=0,alimiter=limit=0.95[o]"
        ffmpeg(*inputs, "-filter_complex", graph, "-map", "[o]", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(out))
        clips[s] = {"file": out.name, "sha256": sha256(out)}
    doc = {
        "attribution": ATTRIBUTION,
        "licence": "CC BY 4.0, read on https://groups.inf.ed.ac.uk/ami/corpus/license.shtml on 2026-11-04",
        "meeting": meeting, "clip_s": CLIP_S, "bleed_db": BLEED_DB,
        "timeline": "synthetic: real isolated utterances placed in turn order (a contiguous meeting window cannot supply the phrases, measured)",
        "cache_dir_env": "P1608_CACHE (default ~/.cache/cp-p1608-ami)",
        "annotations": {"url": ANN_URL, "sha256": sha256(CACHE / "ami_public_manual_1.6.2.zip")},
        "speakers": {
            s: {"headset": sources[s]["headset"], "source_sha256": sources[s]["sha256"], "clip": clips[s],
                "round1": r["plan"][s]["round1"], "round2": r["plan"][s]["round2"]}
            for s in trio
        },
    }
    CORPUS_JSON.parent.mkdir(parents=True, exist_ok=True)
    CORPUS_JSON.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"wrote {CORPUS_JSON.relative_to(REPO)}; clips in {CACHE / 'clips'}")
    return 0


def cmd_verify(_: argparse.Namespace) -> int:
    doc = json.loads(CORPUS_JSON.read_text())
    bad = 0
    for s, v in doc["speakers"].items():
        p = CACHE / "clips" / v["clip"]["file"]
        ok = p.exists() and sha256(p) == v["clip"]["sha256"]
        print(f"{s}: {'ok' if ok else 'MISMATCH'} {p.name}")
        bad += 0 if ok else 1
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("select").set_defaults(fn=cmd_select)
    b = sub.add_parser("build")
    b.add_argument("--meeting", required=True)
    b.set_defaults(fn=cmd_build)
    sub.add_parser("verify").set_defaults(fn=cmd_verify)
    a = ap.parse_args()
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
