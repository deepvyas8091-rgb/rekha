# Launch guide (no coding needed)

This takes about one working day of clicking, plus waiting time for Razorpay and Google approvals. You will copy a few keys from one website into another. Nothing needs to be programmed.

## Before you start: the one decision that matters

**Who collects the money?** Razorpay accounts need an Indian business (PAN, Indian bank account, GST number). You have three options:

1. **Indian entity or partner** (simplest): an Indian company or LLP you own or a trusted partner opens Razorpay and is the seller. GST is charged and filed in India as usual.
2. **UAE entity selling directly**: India treats this as a foreign supplier of digital services (OIDAR). It must register for Indian GST on form REG-10 (no threshold, 18%) and still needs a payment provider that accepts a foreign merchant. Razorpay will not work for this; the code would need a different payment provider.
3. **Merchant of record** (Paddle, Lemon Squeezy or similar): they sell on your behalf and handle tax, for a higher fee (often around 5%). Check that the provider supports UPI for Indian customers before choosing. The code would need a different payment provider.

The code is built for option 1 (Razorpay). Talk to your CA before choosing.

## Step 1: Accounts you need

| Account | Why | Where |
|---|---|---|
| Railway (you have this) | Runs the app on the internet | railway.com |
| GitHub | Holds the app's files; Railway deploys from it | github.com |
| Anthropic Console | AI for palm reading and written readings | console.anthropic.com |
| Google Cloud | "Sign in with Google" button | console.cloud.google.com |
| Razorpay | Monthly payments by UPI and card | dashboard.razorpay.com |
| A domain | e.g. yourname.in | Any registrar |

## Step 2: Put the app on GitHub

1. Unzip `rekha.zip` on your computer.
2. On GitHub: **New repository** → name it `rekha` → **Private** → Create.
3. Click **uploading an existing file**, drag in everything inside the `rekha` folder (not the `node_modules` folder if you see one), then **Commit changes**.

From now on, every change you upload to GitHub is deployed by Railway automatically.

## Step 3: Get your AI key

1. console.anthropic.com → **Billing**: add a card and buy starting credit (USD 20 lasts a long time at launch).
2. **Settings → Limits**: set a monthly spend limit (for example USD 50) so costs can never run away.
3. **API Keys → Create key**. Copy it somewhere safe. This is your `ANTHROPIC_API_KEY`.

## Step 4: Put the app online with Railway

1. railway.com → **New Project → Deploy from GitHub repo** → pick `rekha`. (If Railway asks, allow it to access that repo.)
2. **Add the storage volume first. This step is essential.** On the project canvas, right-click the `rekha` service → **Attach Volume** (or press Ctrl/Cmd + K and type "volume"). Set the mount path to `/data`.
   Without a volume the app stops itself with the message "No storage volume attached", on purpose, so that no user data or subscription is ever lost on a redeploy.
3. Click the service → **Variables** → **Raw Editor**, paste this, fill in the first two lines, and save:

   ```
   ANTHROPIC_API_KEY=your-key-from-step-3
   ADMIN_TOKEN=choose-a-long-password-for-your-dashboard
   NODE_ENV=production
   AI_MONTHLY_BUDGET_USD=30
   ```

   `AI_MONTHLY_BUDGET_USD` is your AI spending cap for the month. At 80% of it, free users' AI readings pause; at 100%, all AI readings pause until the 1st. Timings, panchang and kundli never stop. Raise it as paying users grow.

   Leave the Google and Razorpay values out for now; those features stay switched off until you add them. Railway sets the port by itself, and the app creates its own session secret.
4. **Settings → Deploy → Region**: choose Southeast Asia (Singapore) if offered, the closest region to India.
5. **Settings → Networking → Generate Domain**. In about 2 to 3 minutes you get a link like `https://rekha-production.up.railway.app`.
6. Open it: Today, Panchang, Kundli and Match already work. Your owner dashboard is at `/admin`; enter the `ADMIN_TOKEN` you chose.
7. **Backups:** click the service → **Backups** tab → turn on **Daily** (kept 6 days) and **Weekly** (kept 27 days). This is your safety net for all user and payment data.

To check it is healthy: service → **Deployments** → latest → **View logs**. You should see `Database: /data/rekha.db` and a line listing which keys are not set yet.

Cost: this small app should use only a few dollars a month of Railway resources (memory, CPU, and a volume at USD 0.15 per GB). That may already be covered by your plan's included usage; check the **Usage** page after the first week.

## Step 5: Your domain, rekha.io

The goal: everyone ends up on `https://rekha.io`. The Railway address and `www.rekha.io` forward there automatically, so Google sees one site, not three.

1. Railway → service → **Settings → Networking → Custom Domain** → add `rekha.io`. Add it again for `www.rekha.io`. Keep the port at **8080** for both.
2. Railway shows a **CNAME** target and a **TXT** record for each. Add them where your domain's DNS is managed.
   - `www.rekha.io` is a normal CNAME: name `www`, value = the target Railway shows.
   - `rekha.io` itself (the "root" or "@") cannot be a plain CNAME at most registrars. Use a DNS provider that supports **CNAME flattening** or an **ALIAS/ANAME** record for `@`. The simplest free option is **Cloudflare**: add the site to Cloudflare (free plan), change the nameservers at your registrar to the two Cloudflare gives you, then in Cloudflare DNS add `CNAME @ → <Railway target>` and `CNAME www → <Railway target>`, both with the cloud set to **DNS only** (grey), plus the TXT records. Grey cloud matters: it lets Railway issue the HTTPS certificate.
   - Railway shows a green tick per domain when it sees the records; this can take from a few minutes to a few hours. HTTPS is set up automatically.
3. Only when `https://rekha.io` opens the site, add the Variable `PUBLIC_URL` = `https://rekha.io` (no slash at the end). From then on:
   - every page names `https://rekha.io/...` as its official address, in every language;
   - visits to `rekha-production-12c6.up.railway.app` or `www.rekha.io` are forwarded to `https://rekha.io` with a permanent (301) redirect;
   - `/api/...` is never forwarded, so Railway's health check and Razorpay's webhook keep working on any address.
   If you set `PUBLIC_URL` before the domain works, the site will forward visitors to an address that does not open yet. Remove the variable and it stops.

## Step 6: Sign-in

Two sign-in options are built in. Mobile sign-up works straight away with nothing to set up; Google sign-in needs a free Client ID.

### Mobile number + password (already working)

People tap **Sign in → Create account** and enter their name, mobile number and a password. There is no OTP and no SMS cost. Passwords are stored only as a secure one-way hash.

**Forgotten passwords.** With no OTP, nobody can reset their own password by SMS. Instead:

1. The customer messages you on WhatsApp **from their registered number**. Matching the number is your proof it is them.
2. Open `/admin`, use **Find a customer**, and click **Reset password**.
3. Send them the temporary password privately. They change it under **Account → Change password**. All their other devices are signed out automatically.

Put your WhatsApp support number on the site (for example in the footer) before launch.

### Google sign-in (one tap)

1. Go to **console.cloud.google.com** and create a project called **Rekha** (top bar → project picker → New project).
2. Open **Google Auth Platform** (search for it in the top search bar). If asked, click **Get started** and fill in:
   - App name: **Rekha**
   - User support email: your email
   - Audience: **External**
   - Contact email: your email
3. Go to **Clients → Create client**:
   - Application type: **Web application**
   - Name: Rekha web
   - **Authorized JavaScript origins**, click **Add URI** and paste exactly:
     ```
     https://rekha-production-12c6.up.railway.app
     ```
     When rekha.io is live (Step 5), come back and add `https://rekha.io` and `https://www.rekha.io` too. Origins have no path and no slash at the end.
   - Leave **Authorized redirect URIs** empty; the app does not need one.
   - Click **Create** and copy the **Client ID** (it ends in `.apps.googleusercontent.com`).
4. Go to **Audience** and click **Publish app** so anyone can sign in (otherwise only test users you add can). Basic sign-in (name and email) does not need Google's verification review.
5. Go to **Branding** and add your logo, home page `https://rekha.io`, privacy policy `https://rekha.io/privacy` and terms `https://rekha.io/terms`, and add `rekha.io` under **Authorized domains**. Google only accepts these links on a domain you own, so do this once Step 5 (your own domain) is done. Sign-in works before that.
6. In Railway → service → **Variables**, add `GOOGLE_CLIENT_ID` = the Client ID. Railway redeploys in about a minute.
7. Test: open the site, tap **Sign in**, and the **Continue with Google** button appears under the mobile form.

## Step 7a: Payments with Stripe (start here)

Stripe is switched on automatically when `STRIPE_SECRET_KEY` is set. Use **test mode** first (keys start with `sk_test_`); no real money moves.

1. **Prices are automatic.** Nothing to create in Stripe. On the first checkout the app creates three products (Rekha Solo, Couple, Family) and one price per plan and country tier, each with the local currencies of that tier. Visitors see prices for their country (from their phone's time zone, or Cloudflare's country if the site runs through Cloudflare's proxy):

   | Tier | Countries | Solo / Couple / Family per month |
   |---|---|---|
   | A | US, UK, Europe, GCC, Singapore, Hong Kong, Japan, Australia, Canada ... | $4.99 / $8.99 / $14.99, or local: AED 19 / 35 / 55, £3.99 / 6.99 / 11.99, €4.49 / 7.99 / 13.49 ... |
   | B | Malaysia, Thailand, Latin America, South Africa, Turkey and most others | $2.99 / $4.99 / $7.99, or local: RM 9.90 / 16.90 / 26.90, ฿89 / 149 / 249 ... |
   | C | India, Pakistan, Bangladesh, Nepal, Sri Lanka, Indonesia, Philippines, Vietnam, most of Africa | $1.49 / $2.49 / $3.99, or local: ₹49 / 99 / 199, Rp 19,000 / 35,000 / 59,000 ... |

   To change prices, edit `src/pricing.js` and bump `PRICE_VERSION` (or ask Claude). Existing subscribers keep their old price. You can delete any `STRIPE_PRICE_*` variables you added earlier.
2. **Secret key.** **Developers → API keys** → copy the **Secret key** into `STRIPE_SECRET_KEY`.
3. **Webhook.** **Developers → Webhooks → Add destination** (or "Add endpoint"):
   - URL: `https://rekha-production-12c6.up.railway.app/api/billing/stripe-webhook` (this keeps working after you move to rekha.io, because `/api/` is never redirected; you can switch it to `https://rekha.io/api/billing/stripe-webhook` later)
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
   - Copy the **Signing secret** (starts with `whsec_`) into `STRIPE_WEBHOOK_SECRET`.
4. **Customer portal.** **Settings → Billing → Customer portal** → turn it on, allow updating payment methods, viewing invoices and cancelling. The app's Account screen links to it.
5. Railway redeploys. The log should say `Payments: stripe`. (Only `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are needed.)
6. **Test:** sign in on the site → **Premium** → **Start Solo** → Stripe's page opens → pay with card `4242 4242 4242 4242`, any future date, any CVC. You come back to the app on Premium. To test an Indian card with the RBI e-mandate flow, use `4000 0035 6000 0123`.
7. **Going live:** switch the dashboard to live mode, create the same three prices and a live webhook, and replace the four Stripe values with the live ones.

What Stripe handles for you: card mandates required by RBI for Indian cards on subscriptions, renewal retries, receipts and invoices. What it does not give you from a UAE account: **UPI**, which is how most Indians pay small amounts.

To move to Razorpay later, add the Razorpay values from Step 7b and set `PAYMENT_PROVIDER=razorpay`. Existing Stripe subscribers keep their plan until they cancel; new sign-ups go to Razorpay. (Their Stripe renewals keep syncing as long as the Stripe keys and webhook stay in place.)

## Step 7b: Payments with Razorpay (later, needs an Indian business)

Do all of this in **Test mode** first (toggle at the top of the Razorpay dashboard).

1. **Subscriptions → Plans → Create plan**, three times:
   - Solo: monthly, every 1 month, ₹49
   - Couple: monthly, every 1 month, ₹99
   - Family: monthly, every 1 month, ₹199
   Copy each plan ID (starts with `plan_`) into Railway Variables: `RZP_PLAN_SOLO`, `RZP_PLAN_COUPLE`, `RZP_PLAN_FAMILY`.
2. **Account & Settings → API Keys → Generate key**. Copy Key ID into `RAZORPAY_KEY_ID` and Key Secret into `RAZORPAY_KEY_SECRET`.
3. **Account & Settings → Webhooks → Add new webhook**:
   - URL: `https://rekha.io/api/billing/webhook`
   - Secret: make up a long password; put the same text in Railway's `RAZORPAY_WEBHOOK_SECRET`
   - Events: tick every **subscription.\*** event
4. Save the Railway variables (it redeploys in about a minute). On your site, sign in, open **Premium**, buy Solo with a Razorpay test card or test UPI ID. Your plan should change to Solo straight away and appear in `/admin`.
5. When test mode works, complete Razorpay KYC, switch the dashboard to **Live mode**, create the same three plans and a new webhook there, and replace all Razorpay values in Railway with the live ones.

Check that the plan prices you set in Razorpay are GST-inclusive the way your CA advises. The app shows ₹49 / ₹99 / ₹199 as the price the customer pays.

## Step 8: Search engines and the install option

The site has about 165 public pages per language built for search: 25 Insights articles, daily Choghadiya, Rahu Kaal and Panchang pages for 40 cities, and daily horoscope pages for all 12 signs. They refresh every day by themselves.

1. Check `PUBLIC_URL` = `https://rekha.io` is set (Step 5).
2. Go to **search.google.com/search-console**, add a **Domain** property for `rekha.io` (covers every language folder and www), and verify it with the TXT record Google gives you (same DNS place as Step 5).
3. In Search Console → **Sitemaps**, submit `sitemap.xml`.
4. Optional: do the same in **Bing Webmaster Tools** (it can import from Search Console). Bing also feeds several AI assistants.
5. `robots.txt` already welcomes Google, Bing and AI crawlers (ChatGPT, Claude, Perplexity), and `llms.txt` lists the guides for AI tools.

**Install as an app.** On Android, Chrome shows an **Install Rekha** card on the Today page. On iPhone, the card opens simple "Add to Home Screen" steps for Safari. Nothing to set up; the icons and app settings are included.

## Step 8b: Languages

The site and app work in 15 languages: English, Hindi, Gujarati, Marathi, Bengali, Tamil, Telugu, Kannada, Malayalam, Thai, Vietnamese, Indonesian, Malay, Filipino and Simplified Chinese. Each has its own address: `rekha.io/hi/`, `rekha.io/gu/choghadiya/vadodara`, and so on. English stays at `rekha.io/`.

- **Hindi and Gujarati** interface and page text are written by hand and live from the first deploy.
- **Everything else** (the other 12 languages, the long explanations, palm and face meanings, and the 25 articles in every language) is translated by Claude Haiku **once**, by itself, starting a minute after each deploy. It only translates what is missing, so later deploys cost almost nothing. The first full run costs roughly USD 1 to 2 in total and takes about an hour. Results are stored in the database, so visitors never trigger a translation.
- A language goes **live** (indexed by Google, in the sitemap, in the language menu of public pages) when 95% of its interface and page text is done. Each article goes live in a language once that article is translated. Until then the page still works, in English where text is missing, and is marked "noindex" so Google does not see half-translated pages.
- The **app's language menu** offers all 15 at once, because AI readings and horoscopes are written directly in the chosen language.
- The visitor's choice is remembered: someone who picked Gujarati and later opens `rekha.io` lands on `rekha.io/gu/`.
- **Check progress** in `/admin` → **Languages**: percentage per language, a button to run the job again, and the log.
- **Native review (recommended before marketing in a language):** in `/admin` → Languages, **Export** that language. A native speaker edits the `"text"` values in the file (any changed line counts as reviewed). **Import** it back. Reviewed lines are locked: the machine translation never overwrites them.
- To stop automatic translation, add the Variable `TRANSLATE_AUTO` = `0`; you can still run it from `/admin`.

## Step 8c: Daily alerts and yearly plans (nothing to set up)

- **Daily alerts** (morning summary and "Rahu Kaal in 10 minutes") work on their own. The app creates its push keys on first start and keeps them in the database on the volume. Optional: set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in Railway Variables if you ever move to a new database and want existing alert subscribers to keep working. On iPhone, alerts only work once Rekha is added to the Home Screen (iOS 16.4 or later); the app tells people this.
- **Yearly plans** (10 months' price, so two months free) are created in Stripe automatically on the first yearly checkout, with lookup keys like `rekha_solo_C_year_v1`. In the Stripe customer portal settings, allow switching between the monthly and yearly prices if you want customers to switch there too. With Razorpay, only monthly plans are offered.
- **Trust page**: rekha.io/trust goes to "How Rekha works". If you ever add human astrologers, a shop or ads, change that page in the same release; it promises none of these.

## Step 8d: Speed and search settings (once, in Cloudflare and Railway)

The app already sends the right cache headers; these settings let Cloudflare use them.

1. **Cloudflare > DNS:** set the `rekha.io` record to **Proxied** (orange cloud). **SSL/TLS > Overview:** Full (strict).
2. **Cloudflare > Caching > Cache Rules > Create rule** "Cache Rekha pages": when *URI Path* does not start with `/api/` and *URI Path* is not `/`, then **Eligible for cache**, Edge TTL **Use cache-control header if present**, Browser TTL **Respect origin**. (The home page `/` is left out on purpose: it sends returning visitors to their language.)
3. **Cloudflare > Speed > Optimization:** turn on Brotli, Early Hints and HTTP/3. Leave Rocket Loader **off**.
4. **Cloudflare > Security > Bots:** turn **off** "Block AI bots" and AI Labyrinth, and turn off the managed robots.txt. Rekha's own robots.txt already welcomes search and AI crawlers.
5. **Railway > Settings > Region:** Southeast Asia (Singapore) is closest to India and Southeast Asia.
6. **Bing Webmaster Tools** (bing.com/webmasters): add rekha.io (it can import from Google Search Console) and submit `https://rekha.io/sitemap.xml`. Do the same in Google Search Console. IndexNow is already on: the app pings Bing 5 minutes after each start and then daily (set `INDEXNOW=0` to stop it).
7. Optional: `SOCIAL_LINKS` in Railway Variables, a comma-separated list of Rekha's public profile URLs. They are added to the site's Organization details for search engines.

After this, run https://pagespeed.web.dev on rekha.io and on a city page to see the real numbers.

## Step 8e: Subscribers, push messages and backups

**Where people are kept** (all in the one database on the Railway volume):
- Accounts: everyone who signed up. Only those who ticked "festival reminders and occasional updates" (or turned it on under Account) may get marketing; the time they agreed is stored.
- Email list: visitors who left an email on a festival or city page (consent box required).
- Phones with alerts: the daily-alerts subscribers. "Festival mornings and news" is on by default and can be turned off on the Today screen.

**Owner dashboard (rekha.io/admin):**
- *Audience*: counts, alerts by language and country, and two downloads: the **marketing list** (only people who agreed, with consent date and a personal unsubscribe link) and **all accounts** (for support, not for marketing).
- *Send a push message*: title, message, link, and who gets it (languages, countries, signed-in or not, paying or free), now or at a set time. Phones that turned off news never get these. Keep it to one or two a month.
- Festival mornings are automatic: on Diwali, Karwa Chauth, Chhath and the other festivals, alert subscribers get the day's muhurat for their own city at their morning time (07:30 if none was set).

**Email:** Rekha collects the list but does not send email yet. When you are ready, open a Brevo or Resend account, import the marketing CSV, and send from there; every email must include the subscriber's unsubscribe link from the CSV. Tell me which one you pick and I can connect it so lists sync automatically.

**Backups:** a copy of the database is written every night to `/data/backups` (7 days plus 4 Sundays), and you can download one from the dashboard at any time. Those copies live on the same Railway volume, so also set up an **off-site copy**:
1. Cloudflare > R2 > Create bucket `rekha-backups` (R2 has a free tier).
2. R2 > Manage API tokens > Create token with *Object Read & Write* on that bucket.
3. In Railway Variables add: `BACKUP_S3_ENDPOINT` = `https://<account-id>.r2.cloudflarestorage.com`, `BACKUP_S3_BUCKET` = `rekha-backups`, `BACKUP_S3_KEY` = the access key ID, `BACKUP_S3_SECRET` = the secret access key.
4. The next nightly backup logs "uploaded off-site". In R2, add a lifecycle rule to delete copies older than 90 days.

## Step 8f: Email (Resend) and the visitor's city

**Email.** In Railway Variables add `RESEND_API_KEY` (from Resend > API Keys; never paste it anywhere else) and, if you want another sender than hello@rekha.io, `EMAIL_FROM` (for example `Rekha <namaste@rekha.io>`). Optional: `EMAIL_REPLY_TO` with an inbox you read.
In Resend > Domains, add rekha.io and copy the DNS records it shows (DKIM, SPF for the send subdomain, MX) into Cloudflare DNS as **DNS only** (grey cloud). Email will not send until Resend shows the domain as Verified. Also add a DMARC record if you do not have one: TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:<your inbox>`.
What then happens by itself:
- A confirmation email goes to every new email sign-up; nobody gets anything else until they click it.
- At 9:00 India time the day before Navratri, Karwa Chauth, Dhanteras, Diwali, Chhath, Maha Shivaratri, Holika Dahan, Raksha Bandhan, Janmashtami and Ganesh Chaturthi, everyone on the list gets the times for their own city.
- The dashboard's Email card sends your own emails to a language or country, with a test send first.

**Visitor's city.** Cloudflare > Rules > Settings (Managed Transforms) > turn on **Add visitor location headers**. New visitors then see their own city (from their network) instead of Mumbai, with a one-tap "Use my exact location" for the precise spot. Without it, the app falls back to the biggest city in the visitor's time zone (Mumbai for all of India).

## Step 9: Before you tell anyone

- [ ] A lawyer reviews `/privacy` and `/terms` (drafts are included, with [brackets] to fill in).
- [ ] A native speaker reads the Hindi and Gujarati home page, one city page and one article in each (`/admin` → Languages → Export).
- [ ] An astrologer checks the items marked VERIFY in `README.md` (matching tables, festival dates, Dur Muhurtam).
- [ ] You test on an Android phone and an iPhone: install to home screen from the browser menu.
- [ ] Palm scan works in daylight; face reading works.
- [ ] One real ₹49 live payment, then cancel it from the Account screen, and check `/admin`.

## What it costs to run each month

| Item | At launch |
|---|---|
| Railway usage (server + volume) | a few USD; may sit inside your plan's included usage |
| AI | about ₹1.30 per active user (see the cost model) |
| Razorpay | 2% of each payment |
| Domain (rekha.io) | .io domains cost more than .in; check your registrar's renewal price |
| Translations | about USD 1 to 2 once, then near zero |
| Google sign-in | free |

Full figures and break-even are in `docs/Rekha_Cost_Model.xlsx`.

## Every week: 10 minutes

Open `/admin` and look at: new users, paying users, MRR, AI cost this month, AI budget used, and the average cost per reading type. If AI cost per user rises, lower the monthly limits in `src/plans.js` (or ask Claude to change them).

Every AI call uses Claude Haiku 5.5, the lowest-cost model (a full reading costs about ₹0.09). If palm scans miss lines or readings feel thin, you can upgrade one part at a time in Railway Variables, for example `MODEL_VISION=claude-sonnet-5-5` for palm photos only. Sonnet costs about 20 times more per reading.

## If something goes wrong

| Problem | Fix |
|---|---|
| Log says `Database: ./data/rekha.db` instead of `/data/rekha.db` | Delete the `DB_PATH` variable in Railway. It must not be set there; the app finds the volume itself. Until fixed, every redeploy wipes users and translations |
| `rekha.io` shows "not secure" or does not open | DNS not finished or Cloudflare cloud is orange; set it to DNS only (grey) and wait |
| Site keeps forwarding to rekha.io, which does not open | `PUBLIC_URL` was set before the domain worked; delete the variable until Step 5 is done |
| A language shows English in places | The translation job is still running or a few strings failed; see `/admin` → Languages and press the button again |
| No Google button in the sign-in box | `GOOGLE_CLIENT_ID` is missing in Railway Variables (mobile sign-in still works) |
| "Too many wrong passwords" | The account locks for 15 minutes after 5 wrong tries; or reset it from `/admin` |
| Google says "origin not allowed" or the button is blank | Add your exact site address to Authorized JavaScript origins (Step 6.3); changes can take a few minutes |
| Google shows "app is being tested" | Click Publish app under Audience (Step 6.4) |
| "Payments are not set up yet" | One of the Razorpay values or plan IDs is missing in Railway Variables |
| Paid but plan did not change | Check the webhook URL and secret match (Step 7.3); Razorpay shows webhook delivery logs |
| Readings say "Demo" | `ANTHROPIC_API_KEY` is empty, or your Anthropic credit ran out |
| "AI readings are paused" | The monthly AI budget is used up: raise `AI_MONTHLY_BUDGET_USD` in Railway Variables |
| Deploy fails with "No storage volume attached" | Attach a volume with mount path `/data` (Step 4.2), then redeploy |
| Site down for a few seconds after each change | Normal: Railway briefly stops the app to move the volume to the new version |
| Users or subscriptions disappeared | Restore yesterday's backup: service → **Backups** → **Restore** → **Deploy** |

To change prices later: create new plans in Razorpay, update the plan IDs in Railway Variables, and change `priceInr` in `src/plans.js`. Existing subscribers stay on their old price until they switch.
