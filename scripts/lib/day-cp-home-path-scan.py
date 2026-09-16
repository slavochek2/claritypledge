# Shared by the contract check and its controls: one scanner, so a control that passes proves
# something about the check that actually runs, not about a second copy of it.
import re, sys
lines = open(sys.argv[1], encoding="utf-8").read().split("\n")
inside = False
bad = []
for n, line in enumerate(lines, 1):
    st = line.strip()
    if st.startswith("```"):
        inside = st.startswith("```bash") or st.startswith("```sh")
        continue
    if not inside or st.startswith("#") or not st:
        continue
    if re.search(r"(\$HOME|~/\.claude|/Users/[A-Za-z0-9._-]+/)", line):
        bad.append(f"{n}: {st[:100]}")
print("\n".join(bad))
