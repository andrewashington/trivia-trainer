-- One-off backfill: replay outbox history through the coin rules so coins
-- earned before the feature shipped are credited. Mirrors COIN_RULES in
-- src/lib/coins.ts (amounts, payload userId fields, per-UTC-day caps).
-- Only events older than the first live ledger entry are replayed, so
-- events that already awarded coins are never double-counted.

WITH rules(type, field, amount, cap) AS (
  VALUES
    ('arcade.highscore',     'userId',     50, NULL::int),
    ('arcade.played',        'userId',      5, 10),
    ('arcade.tanks.finished','winnerId',   40, NULL::int),
    ('poll.created',         'createdBy',  15, 5),
    ('recipe.created',       'authorId',   15, 5),
    ('idea.created',         'authorId',   15, 5),
    ('reveal.created',       'createdBy',  15, 5),
    ('event.created',        'creatorId',  15, 5),
    ('listing.created',      'sellerId',   15, 5),
    ('claim.created',        'creatorId',  10, 5),
    ('wishlist.added',       'userId',     10, 5),
    ('map.pin.added',        'addedBy',    10, 5),
    ('countdown.created',    'creatorId',  10, 5),
    ('vault.created',        'createdBy',  10, 5),
    ('file.uploaded',        'uploaderId', 10, 5),
    ('poll.voted',           'voterId',     2, 10),
    ('reveal.submitted',     'userId',     10, 5),
    ('event.rsvp.changed',   'userId',      2, 5),
    ('pet.nudged',           'by',          2, 5)
),
ev AS (
  SELECT o.id, o.type, o."createdAt", r.amount, r.cap,
         o.payload ->> r.field AS uid
  FROM "OutboxEvent" o
  JOIN rules r ON r.type = o.type
  WHERE o."createdAt" < COALESCE(
    (SELECT MIN(ct."createdAt") FROM "CoinTransaction" ct), NOW()
  )
),
ranked AS (
  SELECT ev.*,
         row_number() OVER (
           PARTITION BY uid, type, date_trunc('day', "createdAt" AT TIME ZONE 'UTC')
           ORDER BY "createdAt"
         ) AS rn
  FROM ev
  WHERE uid IS NOT NULL
)
INSERT INTO "CoinTransaction" (id, "userId", amount, reason, meta, "createdAt")
SELECT 'bf_' || id, uid, amount, type,
       jsonb_build_object('backfill', true), "createdAt"
FROM ranked
WHERE (cap IS NULL OR rn <= cap)
  AND uid IN (SELECT id FROM "User");

UPDATE "User" u
SET coins = COALESCE(
  (SELECT SUM(ct.amount) FROM "CoinTransaction" ct WHERE ct."userId" = u.id), 0
);
