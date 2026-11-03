# Kizashi (兆し) — the problem and how it solves it

Kizashi means "sign" or "early signal" in Japanese. It is Renesis Tech's system for turning what is
happening in the Japanese market into content that brings visitors, emails and inquiries to
**renesistech.jp**.

Last updated 2026-11-03.

---

## 1. The problem

Renesis Tech wants inbound leads from Japanese companies for its AI, blockchain, cloud, software and
QA services. The way Japanese B2B buyers find vendors has changed, and a small foreign team could not
keep up by hand.

### 1.1 Buyers search before they talk to anyone
A Japanese IT buyer reads news, Googles things like 「AIエージェント 開発 費用」 and, more and more, asks
ChatGPT, Gemini, Copilot or Perplexity questions like "Which Japanese development partners have a track record in
stablecoins?" They have a shortlist before they ever fill in a form. A vendor that has no useful page
for those searches and questions is invisible.

### 1.2 Our website did not answer those questions
- The Japanese blog had about 24 posts, nearly all blockchain news, while the main business is AI.
- Nothing was written for buyer searches (costs, how to choose a vendor, checklists, comparisons).
- AI assistants cited Gartner, consultancies and competitors, not Renesis.
- The site had no way to capture an email: no downloadable resources, no lead form.

### 1.3 The market moves faster than a manual process
News that matters to buyers appears daily across dozens of Japanese outlets (Nikkei xTECH, ITmedia,
PR TIMES and others). A story like a major security incident has a 48–72 hour window in which a fast,
useful article gets attention. Finding those stories, judging which matter, and planning around them
by hand takes hours a day, so most windows were missed.

### 1.4 Writing good Japanese content is hard for a small foreign team
- There is no full-time native Japanese editor.
- AI-written Japanese often sounds unnatural or makes unsupported claims, which hurts trust.
- Each piece needs research, keywords, the right format and a version for each channel (X, LinkedIn, note,
  newsletter). Without a system, each piece starts from a blank page.

### 1.5 No link between effort and results
Without tracking, nobody could say which topics, formats or channels brought visitors and leads, so
next week's plan was a guess. Pages that were close to Google's first page went unnoticed, and so did
pages that never got traffic.

### 1.6 Constraints
- Small team, little time, almost no budget: everything should run on free tiers.
- No client or CRM personal data may be sent to free AI tiers.
- A person must stay in control of what gets published.

**In one sentence:** Renesis needs to show up wherever Japanese buyers look (news, Google and AI
assistants) with timely, trustworthy Japanese content, and to learn what works, without a large
team or budget.

---

## 2. How Kizashi solves it

Kizashi runs one loop every day and every week:

```
 Listen ─► Decide ─► Plan ─► Write ─► Publish & post ─► Measure ─► (back to Decide)
```

Machines do the collecting, sorting, scoring, research and checking. A person makes the decisions
and does the writing with ready-made prompts.

### 2.1 Listen: see every signal in one place (solves 1.1, 1.3)
Every morning, without anyone involved, Kizashi:
- reads Japanese industry news (RSS feeds and Google News searches for tracked phrases);
- pulls Google Search Console (what people search for and where we rank) and GA4 (who visits);
- asks a weekly set of Japanese buyer questions to AI search engines and records who gets cited;
- has Gemini score every article for relevance to Renesis services, extract the buyer's problem,
  sort it into a category, and read the strongest articles in full for facts and numbers;
- groups articles about the same event into **stories** and gives each a strength score from 0 to 100
  (relevance, coverage, momentum, source weight, evidence), each with a plain-English explanation.

### 2.2 Decide: show what is worth acting on, and why (solves 1.3, 1.5)
- **Today** lists only what needs a person: decisions, writing, posting, checks.
- **Trends** shows the strongest stories from the last 3 days in any field, plus tracked themes seen
  through four lenses at once: news, Google search, what buyers ask AI, and next week's forecast.
- Every story and article has a **"Why this"** section in plain language:
  - **why it's relevant:** the buyer problem, which service and readers it fits;
  - **where it's trending:** how many outlets cover it, how major they are, whether coverage is rising
    or fading, matching Google searches, and which buyer questions to AI it answers;
  - **why it would perform:** its strength, the best format for that kind of news, the hours left in the
    fast-take window, and whether we already have a page on it.
- **Copy package** copies a story's sources, facts and reasoning as text, ready to share or use in a prompt.
- **Save for later** marks a story to come back to.
- A **trend forecast** predicts which terms will get more coverage next week and checks itself
  against what actually happened.

### 2.3 Plan: a balanced weekly plan, and room for breaking news (solves 1.2, 1.3)
- **Monday:** Gemini proposes about 5 articles and 1 lead magnet. It draws on strong signals, searches
  where we rank 3–40, and what has worked before, and skips what we already cover. The rules keep the mix
  on the main business: at least 3 evergreen buyer-search topics and at most 1 blockchain topic.
- **Every topic score is explainable:** demand 40 + service fit 30 + freshness 20 + past performance 10.
- **Breaking stories:** a daily job proposes a fast take for any big story that broke after Monday,
  at most 2 a week, and a person approves or rejects it.
- **Any story or article can go into the plan with one click**, in the format that suits it:
  - fast take (48h article);
  - case study;
  - white paper / mini report;
  - checklist.
- **Content packages:** each topic gets one **hub** on renesistech.jp (where traffic and leads land) and
  **spokes** on other channels that link back to it with tracked links: X, LinkedIn, note.com,
  newsletter, YouTube.
- **Calendar:** hubs and spokes laid out by day, with drag-and-drop, workload, overdue items and an
  ICS feed for your own calendar.

### 2.4 Write: good Japanese without a native editor (solves 1.4)
- For each approved topic, Kizashi researches from cited sources and suggests keywords.
- It then builds a **prompt pack** for ChatGPT or Claude: brief, outline, keywords, sources, the
  Renesis fact sheet, the Japanese style guide and banned AI-sounding phrases.
- Each piece is written in a named Renesis expert's voice, because AI search cites people far more than
  company pages.
- The pasted draft goes through automatic checks and a **cross-model review**: Gemini reviews what
  Claude or ChatGPT wrote, scoring naturalness, keigo, unsupported claims and keyword coverage. A
  failing draft gets a ready-made revision prompt.
- Each spoke has its own copyable prompt with the tracked link to the hub.

### 2.5 Publish and post: capture leads, and keep the record straight (solves 1.2, 1.5)
- Approved articles go to the website's CMS (Payload) **as drafts**; a person clicks publish.
- **Lead magnets** (checklists, calculators, comparisons, templates, reports) become a branded PDF and a
  landing page with a download form. The form sends the email to Brevo, which delivers the PDF and
  stores the contact.
- **Mark posted:** when you publish or post something yourself, you mark it posted in Kizashi, from
  Today, the calendar or the topic page, with an optional link. The plan, calendar and results then
  stay accurate.

### 2.6 Measure and learn: next week is smarter than this week (solves 1.5)
- **Results** shows, per piece, the sessions, engagement, leads and form fills it brought in, plus Search
  Console clicks and position.
- **Per channel and format:** tracked links (`utm_campaign=kizashi-…`) show which spoke brought visitors.
- **AI search (GEO):** citations, share of voice against competitors, sentiment, and visits that AI
  assistants sent to the site, judged over 4-week windows.
- **Feedback:** past performance feeds back into topic scores, and the Monday shortlist sees what worked.
- **"Fix these":** pages ranking 8–20 to rewrite, winners to expand, dead pages to prune.
- **Monthly signal index:** original data on what moved in Japan's AI, blockchain, cloud, software and QA
  news, computed from our own signals and published as a research article. Original data is what AI
  search cites most.

---

## 3. Problem → solution at a glance

| Problem | What Kizashi does |
|---|---|
| Buyers research on Google and AI before contacting vendors | Tracks their searches and AI questions, and plans pages that answer them |
| Blog didn't match the business (mostly blockchain news) | Weekly plan weighted to buyer-search topics and services; at most 1 blockchain topic |
| Missed fast-moving stories | Daily story grouping and scoring, top stories with "Why this", breaking-story proposals, one-click planning |
| No native Japanese editor | Prompt packs with fact sheet and style guide, cross-model review, revision prompts |
| Every piece started from scratch | Research, keywords, outline, hub and spokes and their prompts are prepared before writing starts |
| No email capture | Lead magnets with PDF, landing page, form, Brevo delivery |
| No idea what works | GA4, Search Console, tracked links and AI citations per piece and channel, fed back into scoring |
| Small team, no budget | Runs on free tiers (Gemini, GitHub Actions, Supabase, Brevo, Make); people only decide, write and click publish |

---

## 4. What a person does each week

| When | Time | What |
|---|---|---|
| Every day | 5 min | Open **Today**: approve breaking stories, check what is due |
| Monday | 15 min | Approve or reject the proposed topics on **Plan** |
| Tue–Fri | per piece | Copy the prompt pack into ChatGPT or Claude, paste the draft back, fix what the review flags |
| When publishing | 1 min | Publish in Payload, post the spokes, click **Mark posted** |
| Weekly | 5 min | The AI check: ask 3 assistants this week's questions and mark who they cite |
| Monthly | 15 min | **Results → Fix these**: rewrite, expand or prune |

Everything else runs by itself.

---

## 5. How success is measured

In order of importance:
1. **Sessions** to renesistech.jp from search, AI assistants, social and referrals.
2. **Emails captured** from lead-magnet downloads and newsletter sign-ups.
3. **Form fills and inquiries.**

The leading indicators, which move first, are pages published, posts made, AI-assistant visits, and
being cited for our tracked buyer questions.

---

## 6. What Kizashi does not do

- It does not publish to the live website by itself; a person clicks publish.
- It does not write the final article itself: drafting happens in ChatGPT or Claude via the prompt pack,
  so a person reads every piece.
- It does not qualify leads or replace the CRM; it records which page and campaign each lead came from.
- It does not send client or CRM personal data to free AI tiers.

See [SPEC.md](SPEC.md) for how each part works, and [SETUP.md](SETUP.md) for the accounts it needs.
