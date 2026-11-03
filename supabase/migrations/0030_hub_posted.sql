-- Mark the main piece (hub) as posted by hand, with an optional link, for pieces published
-- outside the Payload flow. Spokes already have topic_spokes.posted_at / post_url.
alter table topics add column if not exists posted_at  timestamptz;
alter table topics add column if not exists posted_url text;
