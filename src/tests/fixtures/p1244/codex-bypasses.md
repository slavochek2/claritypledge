# Must-fail: bypasses an independent codex review found in the first implementation

A leading path does not make it a different command:

```bash
/bin/ls "$YT_STORE"/<video-id>/
```

Double-bracket is an existence test too:

```bash
[[ -d "$DIARIZE_STORE" ]] && echo "already done"
```

A string test is NOT a filesystem inspection and must stay clean:
`[ -z "$DIARIZE_STORE" ] && echo unset`

A file test is:

```bash
[ -d "$DIARIZE_STORE" ] && echo "already done"
```
