INSERT INTO links (slug, target_url, owner_id, clicks, created_at)
VALUES ('e2eSeed', 'https://example.com/seeded', 'user_demo', 0, CAST(unixepoch('subsec') * 1000 AS INTEGER));
