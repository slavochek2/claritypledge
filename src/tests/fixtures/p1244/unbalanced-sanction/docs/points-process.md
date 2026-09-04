# Must-flag: the exemption region is opened and never closed

<!-- store-naming:start -->
YT_STORE=~/.local/share/yt-store

The closing marker is missing. Everything below was silently exempted before the
fix — one deleted marker turned a narrow carve-out into a blanket one, and the
scanner still reported PASS.

```bash
ls ~/.local/share/diarize-store/<video-id>/
```
