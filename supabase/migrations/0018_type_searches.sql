-- Crawl for every story type: Google News Japan searches aimed at funding, regulation, surveys,
-- case studies, partnerships, incidents and launches, plus the Digital Agency's official news.
insert into sources (kind, name, url, category, tier, category_id)
select v.kind, v.name, v.url, v.category, v.tier, c.id
from (values
  ('rss', 'デジタル庁 新着情報', 'https://www.digital.go.jp/rss/news.xml', 'regulation', 'official', 'software'),
  ('rss', 'Google News: 資金調達 AI スタートアップ', 'https://news.google.com/rss/search?q=%E8%B3%87%E9%87%91%E8%AA%BF%E9%81%94%20AI%20%E3%82%B9%E3%82%BF%E3%83%BC%E3%83%88%E3%82%A2%E3%83%83%E3%83%97%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'search', 'ai'),
  ('rss', 'Google News: シリーズA 生成AI', 'https://news.google.com/rss/search?q=%E3%82%B7%E3%83%AA%E3%83%BC%E3%82%BAA%20%E7%94%9F%E6%88%90AI%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'search', 'ai'),
  ('rss', 'Google News: AI 規制 ガイドライン', 'https://news.google.com/rss/search?q=AI%20%E8%A6%8F%E5%88%B6%20%E3%82%AC%E3%82%A4%E3%83%89%E3%83%A9%E3%82%A4%E3%83%B3%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'search', 'ai'),
  ('rss', 'Google News: 改正資金決済法 ステーブルコイン', 'https://news.google.com/rss/search?q=%E6%94%B9%E6%AD%A3%E8%B3%87%E9%87%91%E6%B1%BA%E6%B8%88%E6%B3%95%20%E3%82%B9%E3%83%86%E3%83%BC%E3%83%96%E3%83%AB%E3%82%B3%E3%82%A4%E3%83%B3%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'search', 'blockchain'),
  ('rss', 'Google News: 調査 生成AI 企業 割合', 'https://news.google.com/rss/search?q=%E8%AA%BF%E6%9F%BB%20%E7%94%9F%E6%88%90AI%20%E4%BC%81%E6%A5%AD%20%E5%89%B2%E5%90%88%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'search', 'ai'),
  ('rss', 'Google News: 導入事例 生成AI 削減', 'https://news.google.com/rss/search?q=%E5%B0%8E%E5%85%A5%E4%BA%8B%E4%BE%8B%20%E7%94%9F%E6%88%90AI%20%E5%89%8A%E6%B8%9B%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'search', 'ai'),
  ('rss', 'Google News: 業務提携 AI', 'https://news.google.com/rss/search?q=%E6%A5%AD%E5%8B%99%E6%8F%90%E6%90%BA%20AI%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'search', 'ai'),
  ('rss', 'Google News: 情報漏洩 生成AI', 'https://news.google.com/rss/search?q=%E6%83%85%E5%A0%B1%E6%BC%8F%E6%B4%A9%20%E7%94%9F%E6%88%90AI%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'search', 'quality'),
  ('rss', 'Google News: システム障害 企業', 'https://news.google.com/rss/search?q=%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E9%9A%9C%E5%AE%B3%20%E4%BC%81%E6%A5%AD%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'search', 'quality'),
  ('rss', 'Google News: 提供開始 AIエージェント', 'https://news.google.com/rss/search?q=%E6%8F%90%E4%BE%9B%E9%96%8B%E5%A7%8B%20AI%E3%82%A8%E3%83%BC%E3%82%B8%E3%82%A7%E3%83%B3%E3%83%88%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'search', 'ai'),
  ('rss', 'Google News: 資金調達 ブロックチェーン', 'https://news.google.com/rss/search?q=%E8%B3%87%E9%87%91%E8%AA%BF%E9%81%94%20%E3%83%96%E3%83%AD%E3%83%83%E3%82%AF%E3%83%81%E3%82%A7%E3%83%BC%E3%83%B3%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'search', 'blockchain'),
  ('rss', 'Google News: 実証実験 ブロックチェーン', 'https://news.google.com/rss/search?q=%E5%AE%9F%E8%A8%BC%E5%AE%9F%E9%A8%93%20%E3%83%96%E3%83%AD%E3%83%83%E3%82%AF%E3%83%81%E3%82%A7%E3%83%BC%E3%83%B3%20when%3A14d&hl=ja&gl=JP&ceid=JP:ja', 'keyword_search', 'search', 'blockchain')
) v(kind, name, url, category, tier, cat)
left join categories c on c.slug = v.cat
where not exists (select 1 from sources s where s.url = v.url);
