# Derived fixture — run B, redacted (GENERATED — DO NOT HAND-EDIT)
#
# Produced by scripts/points/redact-run.mjs from the gitignored run file.
# P1210 DW-23. Every field below is listed in that script with the transform
# applied to it. Names, statements, quotes, timecodes, video ids, metrics and
# the contradiction sentence TEXT are dropped at the source, not masked here.

positions_unfilled_field: 0
audience_floor: min_views=2000 min_comments=50

## Contradiction sentences
- id: a | asserts: A1 | denies: A2
- id: b | asserts: UNCAST | denies: A3
- id: c | asserts: A2 | denies: UNCAST

## Cast
- position: 1 | code: A1 | status: FILLED
- position: 2 | code: A2 | status: FILLED
- position: 3 | code: -- | status: UNFILLED
- position: 4 | code: A3 | status: FILLED
- position: 5 | code: A4 | status: FILLED

## Points
- point: P1 | traces_to_sentence: none
  position: A2 = 0 [derived]
  position: A4 = +2 [derived]
- point: P2 | traces_to_sentence: none
  position: A1 = +3 [derived]
  position: A2 = +2 [derived]
  position: A3 = +2 [derived]
  position: A4 = +1 [stretch]
- point: P3 | traces_to_sentence: a
  position: A1 = +2 [derived]
  position: A2 = -2 [close]
  position: A3 = +2 [derived]
- point: P4 | traces_to_sentence: none
  position: A1 = +2 [derived]
  position: A2 = -1 [derived]
  position: A3 = +3 [close]
- point: P5 | traces_to_sentence: none
  position: A1 = +3 [close]
  position: A2 = -3 [close]
