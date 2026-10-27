# Make.com scenario: lead-magnet delivery

One scenario, 3 operations per download (webhook + 2 Brevo calls). Filters don't use operations, so
the free plan's ~1,000 operations/month covers about 330 downloads.

Before you start: open **Delivery** in Signal-to-Lead OS and click **Set up Brevo**. It shows the
`LIST_ID` and `TEMPLATE_ID` used below.

## 1. Webhooks → Custom webhook
- Create a webhook named `renesis-lead-form`. Copy its URL into:
  - `.env` → `MAKE_WEBHOOK_URL`
  - the website → `NEXT_PUBLIC_LEAD_FORM_WEBHOOK`
- Click **Re-determine data structure**, then press **Send test to Make** on the Delivery page.
  Make learns the fields from that sample.

## 2. Filter (between webhook and the next module)
Label: `valid submission`. All of:
- `consent` → Equal to (boolean) → `true`
- `website` → Does not exist / is empty (honeypot)
- `email` → Matches pattern → `^[^@\s]+@[^@\s]+\.[^@\s]+$`

## 3. Brevo → Create or update a contact
(Or HTTP module: `POST https://api.brevo.com/v3/contacts`, header `api-key`.)
- Email: `email`
- List IDs: `LIST_ID`
- Update enabled: yes
- Attributes:
  - `FIRSTNAME` = `name`
  - `COMPANY` = `company`
  - `JOB_TITLE` = `job_title`
  - `LAST_MAGNET` = `magnet_slug`
  - `SIGNUP_PAGE` = `page_url`
  - `UTM_SOURCE` / `UTM_MEDIUM` / `UTM_CAMPAIGN` = `utm_source` / `utm_medium` / `utm_campaign`
  - `CONSENT_AT` = `submitted_at`

## 4. Brevo → Send a transactional email
(Or HTTP: `POST https://api.brevo.com/v3/smtp/email`.)
- Template ID: `TEMPLATE_ID`
- To: `email` (name: `name`)
- Params: `name` = `name`, `title` = `magnet_title`, `download_url` = `download_url`
- Tags: `magnet_slug` (the daily sync uses this tag to match the download to the lead magnet)

## 5. Turn it on
Scheduling: **Immediately as data arrives**. Run one real test from the website with your own email.

## Inquiry / newsletter forms later
The same webhook accepts `form_kind` = `inquiry` / `newsletter`. Add a Router after step 2 and only
send the delivery email on the `lead_magnet` route.
