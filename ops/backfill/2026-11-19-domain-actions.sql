-- Run once on production after the API with migration 0052 (domain_actions)
-- is deployed. Records the one send pause from before the sender guard
-- reported to the API: procomconsultoria.com, paused 18 Nov 18:17 UTC and
-- lifted by staff 19 Nov 13:36 UTC (devlog 2026-11-19-procom-unpause.txt).
-- Safe to run twice: the row is only added when it isn't there yet.
--
--   psql "$DATABASE_URL" -f ops/backfill/2026-11-19-domain-actions.sql

INSERT INTO domain_actions (domain_id, kind, reason, source, created_at, lifted_at, lifted_by)
SELECT d.id, 'sending_paused', '8 recipients that don''t exist', 'sender_guard',
       '2026-11-18 18:17:00+00', '2026-11-19 13:36:00+00', 'staff'
FROM domains d
WHERE lower(d.name) = 'procomconsultoria.com'
  AND d.ownership_verified_at IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM domain_actions a
      WHERE a.domain_id = d.id AND a.kind = 'sending_paused' AND a.created_at = '2026-11-18 18:17:00+00'
  );
