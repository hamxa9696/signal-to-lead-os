-- Phase 3: default knowledge docs (injected into every prompt pack and the AI review).
-- Only fills rows that are still empty, so edits made in the app are never overwritten.

update knowledge_docs set content = $doc$
# Renesis Tech Japan — fact sheet (DRAFT: verify every line before relying on it)

Source: renesistech.jp pages as of 2026-10-27. Remove or correct anything that is not accurate.
Writers may ONLY use numbers, client names and claims that appear here.

## Company
- Renesis Tech: AI-native engineering partner (AI, SaaS, Web3) for startups and enterprises.
- Positioning: "an engineering partner, not just a contractor": discovery before coding, weekly
  reviews and a shared roadmap, documented architecture decisions, post-launch support included.
- Delivery hubs: Canada, UAE, Pakistan, with round-the-clock delivery. Japan site: renesistech.jp
- Own framework: RAEF (Renesis Autonomous Enterprise Framework) for deploying autonomous AI agents
  into business workflows. Page: https://renesistech.jp/renesis-autonomous-enterprise-framework
- Free offer: AI業務診断 (free AI business diagnosis): https://renesistech.jp/ai-shindan
- Contact: https://renesistech.jp/contact

## Services (Japanese name → URL)
- AIエージェント開発 → https://renesistech.jp/services/ai-agent-development (LangGraph, CrewAI, AutoGen)
- 生成AIアプリ開発 → https://renesistech.jp/services/gen-ai-app-development
- AIチャットボット開発 → https://renesistech.jp/services/ai-chatbot-development
- AIコンサルティング → https://renesistech.jp/services/ai-consulting
- AI概念実証（PoC）開発 → https://renesistech.jp/services/ai-proof-of-concept
- PoC・MVP開発: validates the core hypothesis in 8–12 weeks → https://renesistech.jp/services/poc-development
- アプリケーションモダナイゼーション → https://renesistech.jp/services/application-modernization
- カスタムソフトウェア開発 → https://renesistech.jp/services/custom-software-development
- クラウドエンジニアリング / 品質保証・テスト / 保守・運用 / UXデザイン / ソフトウェア監査
- Enterprise SaaS / ERP: multi-tenant, SSO, SOC2-ready
- Blockchain: smart contracts and audits, RWA tokenization, DeFi/Web3, NFT, token launch

## Engagement sizes (from the contact form budget options, USD)
- Under $10,000: consulting
- $10,000–$50,000: PoC validation
- $50,000–$100,000: full MVP
- $100,000–$250,000: SaaS scaling
- $250,000+: enterprise / blockchain

## Case studies (public)
- Kensho (Renesis's own product): enterprise knowledge-search AI that inherits existing per-document
  access rights and cites a source document for every answer. Works via LINE official account; cloud,
  on-prem and air-gapped deployments.
- Vaffa Cosmo: NFT gaming ecosystem on Ethereum. $1.4M raised in primary NFT sales.
- STORYMII: AI bedtime-story generator; 10K+ personalised stories generated.
- Covertly: multi-LLM platform (OpenAI, Claude, Llama, Gemini, Dolphin) under one subscription, with anonymity.
- Clients have raised $50M+ in total (site claim).

## Things we must NOT claim
- Japanese client names that are not listed above.
- Specific prices for a project (give ranges only, using the engagement sizes above).
- Guaranteed results, rankings, or "No.1" claims.
$doc$
where kind = 'fact_sheet' and content = '';

update knowledge_docs set content = $doc$
# Japanese writing style guide (Renesis Tech Japan blog)

## Voice
- です・ます調 throughout. Polite and professional, not stiff. No 尊敬語 overload.
- Reader: 情報システム部門・DX推進担当・経営企画の管理職 at Japanese companies (中堅〜大企業).
  They want practical judgement material: costs, steps, risks, how to decide.
- Speak with experience ("私たちが支援する現場では〜"), but never invent specific clients or numbers.

## Structure
- First 2 paragraphs answer the search query directly (結論ファースト). No long preamble.
- H2 for main sections (5–8), H3 inside when useful. Every H2 should be scannable as a summary.
- Short paragraphs: 2–4 sentences. Use bullet lists for steps, criteria, comparisons.
- Concrete examples, checklists, and decision criteria over abstract explanation.
- End with a まとめ section, then a CTA paragraph linking to the matching service page or the
  free AI業務診断 (https://renesistech.jp/ai-shindan).
- Length: articles 4,000–6,000 Japanese characters.

## Language
- Prefer plain Japanese over katakana jargon when a common word exists (e.g. 導入 not イントロダクション).
  Keep established terms: AIエージェント, PoC, DX, LLM, RAG.
- Write English product names in their official form (ChatGPT, Microsoft Copilot, LangGraph).
- Numbers: half-width digits; 万/億 for large amounts (例: 500万円). Dates: 2026年10月.
- Full-width Japanese punctuation（、。「」）; half-width for English and numbers.
- No exclamation marks. No emojis. No 煽り (fear or hype marketing).

## Facts
- Use only facts from the fact sheet, or widely known public facts (laws, product names).
- If a number or claim needs a source you don't have, write [要確認] right after it.
  These markers must be resolved before publishing.

## Formatting (Markdown that converts cleanly to the CMS)
- Use ## and ### headings, paragraphs, - bullet lists, 1. numbered lists, **bold**, [links](url).
- Do NOT use tables, images, code blocks, HTML, or H1 (the title is added automatically).
$doc$
where kind = 'style_guide' and content = '';

update knowledge_docs set content = $doc$
いかがでしたか
いかがでしたでしょうか
と言えるでしょう
と言っても過言ではありません
ではないでしょうか
今回は〜について解説します
皆さん
この記事では
注目を集めています
ますます重要になっています
必見
徹底解説
完全ガイド
革命的
ゲームチェンジャー
シームレスに
包括的な
多岐にわたる
さまざまな観点から
重要な役割を果たします
$doc$
where kind = 'banned_phrases' and content = '';

update knowledge_docs set content = $doc$
naturalness: Reads like a native Japanese B2B writer wrote it. No translated-from-English phrasing, no unnatural katakana, no repetitive sentence endings (〜です。〜です。〜です。).
keigo: Consistent です・ます. No mixing with である調. Appropriate politeness, not excessive.
answer_first: The first two paragraphs directly answer the primary keyword's search intent.
structure: Clear H2/H3 hierarchy. Each H2 is meaningful on its own. Short paragraphs, lists where useful.
specificity: Concrete steps, criteria, examples and numbers (from the fact sheet). Little generic filler.
claims: No invented clients, statistics, prices or guarantees. Every number is from the fact sheet or a well-known public fact, or marked [要確認].
keyword_coverage: Primary keyword in the title and the first paragraph; secondary keywords used naturally; no keyword stuffing.
cta: Ends with a relevant CTA linking to the matching Renesis service page or the AI診断.
repetition: No paragraphs or points repeated in different words.
$doc$
where kind = 'review_checklist' and content = '';
