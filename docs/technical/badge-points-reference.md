# Badge Points Reference

Exported from prod DB (`besjtuodziykmjidubzw`) on 2026-04-12.

The badge system is built around 9 **clarity points** (stations st1–st9). Each station may have multiple point versions (v1, v2, …). A user earns one badge point per point_id — the full badge requires covering all 9 stations (one qualifying point_id per station).

**Certification trigger:** A point qualifies when its `system_tags` array contains `"understanding"`. All 16 `#understanding`-tagged points are listed below.

---

## All Points with `#understanding` Tag (16 total)

> All 9 stations have at least one `#understanding`-tagged point. No missing tags.

| Station | Version | Point ID | Statement (first 120 chars) |
|---------|---------|----------|------------------------------|
| st1 | v1 | `6d253c2b-32b1-4a10-826c-4a4844b23e14` | Most people assume understanding is binary — you either get it or you don't. "Understand" covers at least three… |
| st1 | v2 | `a24d8d29-8f67-4ceb-b65a-0b4c0efc6a51` | When someone says "you don't understand me," they could mean at least three different things. They might mean… |
| st2 | v1 | `b8e371b7-52bc-4229-80a1-841c64aa03cd` | My estimates of how well I understand others are unreliable. Without verification, I have no error signal — I… |
| st3 | v1 | `86fb9e04-e04d-4399-9928-83fd8da9ab03` | The speaker knows what they meant to communicate. The listener doesn't. The only way to verify cognitive understanding… |
| st4 | v1 | `a0096d98-768d-46c3-832d-ba104a31282c` | The listener explains back what they think the speaker meant. If they express judgment or criticism while doing so… |
| st5 | v1 | `cb114d49-21eb-409d-afb1-19e40b9ba36c` | Two people can hold exactly the same belief and be uncertain if the other holds it or not. That's a shared belief… |
| st6 | v1 | `978f7a1e-5e80-41b7-aed5-35cfcd14a379` | When interests clash in a conversation and one party pursues agreement ("confirm I'm right") or emotional validation… |
| st6 | v2 | `0156a99d-e306-4799-9c59-90195507c836` | When interests clash and both people pursue agreement with each other, one of them will have to give up their position… |
| st7 | v1 | `b5e50000-0000-4000-b000-000000000005` | Once two people both understand the process of how to reach verified cognitive understanding and both know the other… |
| st7 | v2 | `4ea37dea-0325-4172-b5dc-bf3731bf6e89` | Once both people know how to verify cognitive understanding — I know that you know that I know that you know and so on… |
| st8 | v1 | `1fe66b60-0d82-43a9-8d71-437453da6b12` | I am highly motivated to increase my capacity to distinguish what I understand and what I don't understand in… |
| st8 | v1 | `cbdfadce-10ca-4c79-b028-ecc1856aa7db` | The only reliable process for verifying mutual understanding is for the listener to explain back what they understood… |
| st8 | v2 | `ba8d7e91-cbca-4501-930f-cb456891c848` | In any important partnership — personal or professional — a written commitment to verify cognitive understanding… |
| st9 | v1 | `b5e70000-0000-4000-b000-000000000007` | If you understand how cognitive understanding works and why it matters, the ClarityPledge is making that commitment… |
| st9 | v1 | `d0534270-aada-4817-9cbb-39eb45723870` | I am highly motivated to increase my capacity to help others, distinguishing what they understand and what they don't… |
| st9 | v2 | `28a1d40b-c243-4501-bdb0-a655f2d853f7` | You might already practice verified cognitive understanding. But other people don't know that. Without a public signal… |

---

## Station Coverage Summary

All 9 stations have the `#understanding` tag set. No missing tags.

| Station | Points with tag | Versions |
|---------|----------------|----------|
| st1 | 2 | v1, v2 |
| st2 | 1 | v1 |
| st3 | 1 | v1 |
| st4 | 1 | v1 |
| st5 | 1 | v1 |
| st6 | 2 | v1, v2 |
| st7 | 2 | v1, v2 |
| st8 | 3 | v1 (×2), v2 |
| st9 | 3 | v1 (×2), v2 |

---

## Notes for Badge Implementation

- **Full badge threshold:** 9 distinct `point_id`s — one per station. The `badge_points` table uses `UNIQUE(user_id, point_id)` so a user earns at most one badge point per point_id.
- **Station coverage:** The badge service should check for coverage across all 9 stations, not just count of point_ids. A user with 9 v1 badges from the same station has NOT completed the badge.
- **Multi-version stations:** st8 has two separate v1 point_ids (`1fe66b60` and `cbdfadce`). These are distinct point_ids — earning both adds 2 to the badge count. If badge completion is "all 9 stations covered," the service needs to join on station tag, not just count distinct point_ids.
- **`stories.point_id` column:** Does not exist yet in prod (as of this export). The P686 migration will add it. This reference file was created before that migration.
- **Total points in prod:** 27 (16 with `#understanding` tag, 11 without).
