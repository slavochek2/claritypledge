# Clarity Live - Rating Flow

This document describes the UX flow for rating understanding during a Clarity Live session.

**Context:** Gosha just spoke, now both participants rate how well Slava understood Gosha.

---

## SCREEN 1: Rating (separate screen)

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **How much Slava understands you:** | **How much Gosha understands you:** |
| `[0][1][2][3][4][5][6][7][8][9][10]` | `[0][1][2][3][4][5][6][7][8][9][10]` |

---

## SCREEN 2: Gosha submitted, Slava hasn't (same page as screen 3)

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| You rated how much Slava understands you. | Gosha rated how much you understand them. |
| **How much Slava understands you:** | **How much you understand Gosha:** |
| (You believe: 7 / Slava believes: ?) | `[0][1][2]...[10]` |
| Waiting for Slava's rating... | Submit yours to see Gosha's rating. |
| `[Change rating]` | |
| `[Skip]` *(auto-skips in 30s)* | `[Skip]` *(auto-skips in 30s)* |

---

## SCREEN 3a-i: Both submitted - overconfidence risk (same page as screen 2)

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Slava has overconfidence risk: 2 points** | **You have overconfidence risk: 2 points** |
| (You believe: 7 / Slava believes: 9) | (You believe: 9 / Gosha believes: 7) |
| | |
| `[Ask to explain back]` | `[Change rating]` |
| `[Skip]` *(auto-skips in 30s)* | `[Explain back]` |
| | `[Skip]` *(auto-skips in 30s)* |

---

## SCREEN 3a-ii: Both submitted - underconfidence risk (same page as screen 2)

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Slava has underconfidence risk: 2 points** | **You have underconfidence risk: 2 points** |
| (You believe: 7 / Slava believes: 5) | (You believe: 5 / Gosha believes: 7) |
| | |
| `[Ask to explain back]` | `[Change rating]` |
| `[Skip]` *(auto-skips in 30s)* | `[Explain back]` |
| | `[Skip]` *(auto-skips in 30s)* |

---

## SCREEN 3b-i: Both submitted - Gosha believes 10/10, Slava underconfident

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Slava understood you perfectly!** | **You understood Gosha perfectly!** |
| **Slava was underconfidend: 2 points** | **You were underconfidend: 2 points** |
| (You believe: 10 / Slava believes: 8) | (You believe: 8 / Gosha believes: 10) |
| | |
| *(auto-returns in 5s)* | *(auto-returns in 5s)* |

---

## SCREEN 3b-ii: Both submitted - Gosha believes 10/10, no gap

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Slava understood you perfectly!** | **You understood Gosha perfectly!** |
| (You believe: 10 / Slava believes: 10) | (You believe: 10 / Gosha believes: 10) |
| | |
| *(auto-returns in 5s)* | *(auto-returns in 5s)* |

No buttons needed. Celebration, then auto-continue to next turn.

---

## SCREEN 4: Explain-back in progress

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Waiting for Slava to explain back...** | **Please explain back...** |
| (You believe: 7 / Slava believes: 9) | (You believe: 9 / Gosha believes: 7) |
| | |
| **How much does Slava actually understand?** | Waiting for Gosha to rate... |
| `[0][1][2][3][4][5][6][7][8][9][10]` | |
| `[Skip]` | `[Skip]` |

---

## SCREEN 5a: Results - first explain-back, NOT 10/10

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Results:** | **Results:** |
| (You believe: 7 / Slava believes: 9) | (You believe: 9 / Gosha believes: 7) |
| You believe after explain-back: 8 | Gosha believes after explain-back: 8 |
| | |
| `[Ask to explain back again]` ← primary | `[Explain back again]` |
| `[Skip]` | `[Skip]` |

---

## SCREEN 5a-ii: Results - multiple rounds, NOT 10/10

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Results:** | **Results:** |
| (You believe: 7 / Slava believes: 9) | (You believe: 9 / Gosha believes: 7) |
| You believe after 1st explain-back: 8 | Gosha believes after 1st explain-back: 8 |
| You believe after 2nd explain-back: 9 | Gosha believes after 2nd explain-back: 9 |
| | |
| `[Ask to explain back again]` ← primary | `[Explain back again]` |
| `[Skip]` | `[Skip]` |

---

## SCREEN 5b: Results - 10/10 achieved

| Gosha's Phone | Slava's Phone |
|---------------|---------------|
| **Perfect understanding!** | **Perfect understanding!** |
| Slava believes: 9 | You believe: 9 |
| You believe: 7 | Gosha believes: 7 |
| You believe after explain-back: 10 | Gosha believes after explain-back: 10 |
| | |
| *(auto-returns in 5s)* | *(auto-returns in 5s)* |

---

## SCREEN 6: Done

→ Return to conversation / next turn

---

## Notes

**History button (formerly "Review"):** Renamed to `[History]` because "Review" was vague - could mean review the session, review the other person, etc. "History" clearly indicates what it does: view past rounds and their outcomes. The History button lives on the main session screen and is accessible anytime during or after the session.
