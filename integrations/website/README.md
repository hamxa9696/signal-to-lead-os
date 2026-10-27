# Website integration (renesistech.jp developer)

One component, one rule. Nothing else on the site changes.

## 1. Add the component
Copy `LeadMagnetForm.tsx` into the website (Next.js, Tailwind) and set two public env vars:

```
NEXT_PUBLIC_LEAD_FORM_WEBHOOK=<Make.com webhook URL>
NEXT_PUBLIC_LEAD_MAGNET_BASE_URL=<shown on the Delivery page of Signal-to-Lead OS>
```

## 2. Render it on download posts
In the blog post page, below the content, when the post's category is **資料ダウンロード**:

```tsx
{post.category?.slug === "resources" && (
  <LeadMagnetForm slug={post.slug} title={post.title} />
)}
```

(Use whatever slug you give the 資料ダウンロード category. Signal-to-Lead OS creates these posts as drafts
with that category; an editor publishes them.)

## 3. Privacy policy
The form collects name, company, job title and email, and sends them to Make.com and Brevo. Add those
two processors and the purpose (資料送付・ご案内メール) to `/privacy` (APPI).

## What it sends
One JSON POST per submission. See `samplePayload()` in `src/lib/make.ts`. The fields are `form_kind`, `email`, `name`,
`company`, `job_title`, `consent`, `consent_text`, `magnet_slug`, `magnet_title`, `download_url`, `page_url`,
`referrer`, `utm_*`, `submitted_at`, and `website` (honeypot, always empty from real users).

It also fires GA4 `generate_lead` with `form_kind` and `content_slug` (mark it as a key event, SETUP.md §4).

Note: the webhook URL is public in the page source. The honeypot and Make's filter stop simple bots.
If spam becomes a problem, add Cloudflare Turnstile (free) in front.
