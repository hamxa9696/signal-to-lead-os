-- Re-sort recent relevant signals once so each gets Gemini's "why" for its category
-- (the sort job now records it). The next sort run picks these up.
update signals set sorted_at = null
where status = 'analyzed' and coalesce(published_at, fetched_at) >= now() - interval '45 days';
