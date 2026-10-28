-- Suggested keywords per topic: real Google search suggestions (+ Search Console queries),
-- ranked by Gemini for this article. Shown on Topics and fed into the prompt pack.
alter table topics add column if not exists keyword_plan jsonb;      -- {primary, keywords[{kw, intent, role, competition, why, source}]}
alter table topics add column if not exists keyword_plan_at timestamptz;
