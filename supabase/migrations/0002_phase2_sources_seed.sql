-- Phase 2: own-site page inventory, small schema fixes, seed services + sources.

-- Search Console rows are stored across all countries (no country dimension requested).
alter table search_queries_daily alter column country set default 'all';

-- Jobs can be skipped when a credential isn't configured yet.
alter table job_runs drop constraint job_runs_status_check;
alter table job_runs add constraint job_runs_status_check
  check (status in ('running', 'ok', 'error', 'skipped'));

-- Pages already on our own site (from its sitemap). Used to avoid proposing duplicate topics.
create table site_pages (
  url         text primary key,
  path        text not null,
  section     text,                 -- 'blog', 'services', 'success-stories', ...
  title       text,
  lastmod     timestamptz,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index site_pages_section_idx on site_pages (section);

-- ---------------------------------------------------------------------------
-- Services (from renesistech.jp/services, 2026-10-27)
-- ---------------------------------------------------------------------------
insert into services (slug, name_en, name_ja, landing_url) values
  ('ai-agent-development',        'AI Agent Development',            'AIエージェント開発サービス',                    'https://renesistech.jp/services/ai-agent-development'),
  ('ai-chatbot-development',      'AI Chatbot Development',          'AIチャットボット開発サービス',                  'https://renesistech.jp/services/ai-chatbot-development'),
  ('ai-consulting',               'AI Consulting',                   'AIコンサルティングサービス',                    'https://renesistech.jp/services/ai-consulting'),
  ('ai-development-services',     'AI Engineering Services',         'AIエンジニアリングサービス',                    'https://renesistech.jp/services/ai-development-services'),
  ('ai-proof-of-concept',         'AI Proof of Concept',             'AI概念実証（PoC）開発',                          'https://renesistech.jp/services/ai-proof-of-concept'),
  ('gen-ai-app-development',      'Generative AI App Development',   '生成AIアプリ開発',                               'https://renesistech.jp/services/gen-ai-app-development'),
  ('app-development',             'Application Development',         'アプリケーション開発サービス',                  'https://renesistech.jp/services/app-development'),
  ('application-modernization',   'Application Modernization',       'アプリケーションモダナイゼーションサービス',    'https://renesistech.jp/services/application-modernization'),
  ('custom-software-development', 'Custom Software Development',     'カスタムソフトウェア開発サービス',              'https://renesistech.jp/services/custom-software-development'),
  ('digital-transformation',      'Digital Transformation',          'デジタルトランスフォーメーションサービス',      'https://renesistech.jp/services/digital-transformation'),
  ('poc-development',             'PoC Development',                 'PoC開発サービス',                                'https://renesistech.jp/services/poc-development'),
  ('cloud-engineering',           'Cloud Engineering',               'クラウドエンジニアリングサービス',              'https://renesistech.jp/services/cloud-engineering'),
  ('quality-assurance',           'Quality Assurance & Testing',     '品質保証・テストサービス',                      'https://renesistech.jp/services/quality-assurance'),
  ('software-audit',              'Software Audit',                  'ソフトウェア監査サービス',                      'https://renesistech.jp/services/software-audit'),
  ('support-maintenance',         'Support & Maintenance',           '保守・運用サポートサービス',                    'https://renesistech.jp/services/support-maintenance'),
  ('user-experience-design',      'UX & Design',                     'UX・デザインサービス',                          'https://renesistech.jp/services/user-experience-design'),
  ('vibe-coding',                 'Vibe Coding',                     'Vibeコーディングサービス',                      'https://renesistech.jp/services/vibe-coding'),
  ('blockchain-defi-web3',        'DeFi & Web3 Development',         'DeFi・Web3開発サービス',                        'https://renesistech.jp/services/blockchain/defi-web3'),
  ('blockchain-nft',              'NFT & Digital Collectibles',      'NFT開発・デジタルコレクティブルプラットフォーム', 'https://renesistech.jp/services/blockchain/nft-collectibles'),
  ('blockchain-rwa',              'RWA Tokenization',                'RWAトークン化・エンタープライズブロックチェーン', 'https://renesistech.jp/services/blockchain/rwa-enterprise'),
  ('blockchain-smart-contracts',  'Smart Contracts & Auditing',      'スマートコントラクト開発・セキュリティ監査',    'https://renesistech.jp/services/blockchain/smart-contracts'),
  ('blockchain-token-launch',     'Token Launch & Tokenomics',       'トークンローンチ・トークノミクスサービス',      'https://renesistech.jp/services/blockchain/token-launch')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Sources (each URL checked live on 2026-10-27)
-- ---------------------------------------------------------------------------
insert into sources (kind, name, url, category) values
  ('rss',     'ITmedia エンタープライズ',  'https://rss.itmedia.co.jp/rss/2.0/enterprise.xml',  'industry_news'),
  ('rss',     'ITmedia AI+',              'https://rss.itmedia.co.jp/rss/2.0/aiplus.xml',      'industry_news'),
  ('rss',     'MONOist',                  'https://rss.itmedia.co.jp/rss/2.0/monoist.xml',     'industry_news'),
  ('rss',     '日経クロステック',          'https://xtech.nikkei.com/rss/index.rdf',             'industry_news'),
  ('rss',     'EnterpriseZine',           'https://enterprisezine.jp/rss/new/20/index.xml',     'industry_news'),
  ('rss',     'IT Leaders',               'https://it.impress.co.jp/list/feed/rss',             'industry_news'),
  ('rss',     'Publickey',                'https://www.publickey1.jp/atom.xml',                 'industry_news'),
  ('rss',     'CodeZine',                 'https://codezine.jp/rss/new/20/index.xml',           'developer_news'),
  ('sitemap', 'renesistech.jp (own site)', 'https://renesistech.jp/sitemap.xml',                'own_site'),
  ('gsc',     'Google Search Console',    null,                                                 'search_demand');
