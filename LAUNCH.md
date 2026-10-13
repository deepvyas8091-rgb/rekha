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

## Step 7: Payments with Razorpay

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
