# Must-fail: existence checks against a store, in command spans

```bash
ls $DIARIZE_STORE/<video-id>/
```

The split case — verb and store name on separate lines of ONE fenced block:

```bash
ls -la
# then look in the diarize-store directory
```

And an inline pair on a single line: run `test -f` against `"$YT_STORE"/<id>/en.vtt`.
