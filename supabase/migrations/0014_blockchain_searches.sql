-- Blockchain searches on Google News Japan, and a category for every keyword search so the
-- dashboard's trending keywords can be filtered by category (e.g. Blockchain only).

alter table sources add column if not exists category_id uuid references categories(id) on delete set null;

insert into sources (kind, name, url, category)
select v.kind, v.name, v.url, v.category from (values
  ('rss', 'Google News: ブロックチェーン 企業 導入', 'https://news.google.com/rss/search?q=%E3%83%96%E3%83%AD%E3%83%83%E3%82%AF%E3%83%81%E3%82%A7%E3%83%BC%E3%83%B3%20%E4%BC%81%E6%A5%AD%20%E5%B0%8E%E5%85%A5%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search'),
  ('rss', 'Google News: ステーブルコイン', 'https://news.google.com/rss/search?q=%E3%82%B9%E3%83%86%E3%83%BC%E3%83%96%E3%83%AB%E3%82%B3%E3%82%A4%E3%83%B3%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search'),
  ('rss', 'Google News: セキュリティトークン', 'https://news.google.com/rss/search?q=%E3%82%BB%E3%82%AD%E3%83%A5%E3%83%AA%E3%83%86%E3%82%A3%E3%83%88%E3%83%BC%E3%82%AF%E3%83%B3%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search'),
  ('rss', 'Google News: Web3 日本', 'https://news.google.com/rss/search?q=Web3%20%E6%97%A5%E6%9C%AC%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search'),
  ('rss', 'Google News: NFT 活用', 'https://news.google.com/rss/search?q=NFT%20%E6%B4%BB%E7%94%A8%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search'),
  ('rss', 'Google News: RWA トークン化', 'https://news.google.com/rss/search?q=RWA%20%E3%83%88%E3%83%BC%E3%82%AF%E3%83%B3%E5%8C%96%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search'),
  ('rss', 'Google News: 暗号資産 規制', 'https://news.google.com/rss/search?q=%E6%9A%97%E5%8F%B7%E8%B3%87%E7%94%A3%20%E8%A6%8F%E5%88%B6%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search'),
  ('rss', 'Google News: スマートコントラクト', 'https://news.google.com/rss/search?q=%E3%82%B9%E3%83%9E%E3%83%BC%E3%83%88%E3%82%B3%E3%83%B3%E3%83%88%E3%83%A9%E3%82%AF%E3%83%88%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search')
) v(kind, name, url, category)
where not exists (select 1 from sources s where s.url = v.url);

update sources s set category_id = c.id from categories c
where s.category = 'keyword_search' and s.category_id is null and c.slug = case
  when s.name ~ '(ブロックチェーン|ステーブルコイン|トークン|Web3|NFT|RWA|暗号資産|スマートコントラクト|STO)' then 'blockchain'
  when s.name ~ '(AI|生成AI|エージェント)' then 'ai'
  when s.name ~ '(レガシー|クラウド|モダナイ|DX)' then 'cloud'
  else 'software' end;
