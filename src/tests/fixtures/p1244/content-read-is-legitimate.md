# Must-pass: reading the CONTENT of a named artifact is not an inspection

The rule forbids inferring that work was done from the filesystem. It does not forbid
reading a known file — that is how quotes are verified. Both of these are real lines
from the pipeline and must stay CLEAN.

```bash
grep -ciE "<surname>" "$YT_STORE"/<id>/en.vtt   # 0 is a STOP
```

```bash
grep -cF "$q" "$YT_STORE"/<video-id>/<lang>.clean.txt || echo 0
```
