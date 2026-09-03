# Fixture — a stage file with a planted store inspection (P1210 DW-12 must-fail)

Before diarizing, re-confirm the bytes rather than trusting the label:

    ls ~/.local/share/yt-store/<video-id>/

That line is the defect: it inspects a directory instead of asking the owning tool,
and it inspects the wrong store.
