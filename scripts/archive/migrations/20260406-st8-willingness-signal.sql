-- ST8 sharpening: "willingness as signal" insight from 2026-04-06 conversation
-- All three items have only Slava's positions → safe to UPDATE in place
-- Links preserved exactly as-is in all content

BEGIN;

-- st8 point: insert "That refusal isn't neutral" sentence before final sentence
UPDATE points SET
  statement = E'In any important partnership — personal or professional — a written commitment to verify cognitive understanding gives both people the same standard to hold each other accountable to. It makes misunderstandings visible early, when it''s still easy to correct. Can your partner explain back when the [clarity partnership agreement](https://claritypledge.com/partner-template) applies, how verification of cognitive understanding works, and why it matters? That''s the test of whether your partner actually understands the commitment you''re both making. Many people can explain back, but won''t. That refusal isn''t neutral — it tells you something about their relationship to being checked. Everything that goes wrong later in your partnership starts there.',
  updated_at = now()
WHERE id = 'ba8d7e91-cbca-4501-930f-cb456891c848';

-- st8-a anti-point: add third sentence weaponizing the proposer
UPDATE points SET
  statement = E'Good partners don''t need communication rules — they just need to genuinely care about each other. If you need a written agreement to communicate well, the relationship is already broken. And anyone who insists on one is signaling distrust.',
  updated_at = now()
WHERE id = '7c287f2d-1023-4c1f-a72f-fa692f7e8f8c';

-- st8 story: insert signal sentence before closing line, preserve all links
UPDATE stories SET
  content = E'Fourteen co-founders. Nine separations. None of us wanted them. In one partnership, my co-founder wanted to replace our kanban platform with an integrated dev tool. I asked him to explain back my reasoning for keeping it. He restated his own position instead — confident he already understood mine. He hadn''t. We kept clashing over the same decision because the misunderstanding never got corrected. That pattern repeated across partnerships. Not disagreement — false agreement. We''d nod, move on, and discover months later we''d been operating on different assumptions. After enough of this, I stopped hoping people would just understand me. I designed a [clarity partner agreement](https://claritypledge.com/partner-template). And [nine points on why and how to verify cognitive understanding](https://claritypledge.com/d/ck) that both partners need to understand the same way. Then I built a [clarity sessions tool](https://claritypledge.com/live) to check if they actually do. Most people agree to things they can''t explain back. How they respond when you ask them to try tells you more about the partnership than anything they say. I want partners who can. #st8 #partners',
  updated_at = now()
WHERE id = '7293c1d6-d7d1-41ab-b74d-990cfb2a6e3d';

COMMIT;
