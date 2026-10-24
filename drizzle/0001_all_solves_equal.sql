-- All history has equal standing. Preserve timings, splits, notes and deletions.
UPDATE solves
SET data = json_set(
      data,
      '$.trust', 'confirmed',
      '$.usedScramble', json('true'),
      '$.updatedAt', MAX(updated_at + 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000)
    ),
    updated_at = MAX(updated_at + 1, CAST(strftime('%s', 'now') AS INTEGER) * 1000)
WHERE COALESCE(json_extract(data, '$.trust'), '') != 'confirmed'
   OR COALESCE(json_extract(data, '$.usedScramble'), 0) != 1;
