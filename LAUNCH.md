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

## Step 5: Your own domain

1. Service → **Settings → Networking → Custom Domain** → add `yourdomain.in` (and `www.yourdomain.in` if you want it).
2. At your domain registrar, add both records Railway shows you: a **CNAME** and a **TXT** (the TXT proves you own the domain). HTTPS is set up automatically.

## Step 6: Google sign-in

1. console.cloud.google.com → create a project called Rekha.
2. **APIs & Services → OAuth consent screen**: External, app name, support email, your domain, the links `https://yourdomain.in/privacy` and `https://yourdomain.in/terms`. Publish the app.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. Under **Authorized JavaScript origins** add `https://yourdomain.in` (and your `up.railway.app` link while testing).
5. Railway → service → **Variables** → **New Variable** `GOOGLE_CLIENT_ID` = your Client ID. Railway redeploys by itself.

## Step 7: Payments with Razorpay

Do all of this in **Test mode** first (toggle at the top of the Razorpay dashboard).

1. **Subscriptions → Plans → Create plan**, three times:
   - Solo: monthly, every 1 month, ₹49
   - Couple: monthly, every 1 month, ₹99
   - Family: monthly, every 1 month, ₹199
   Copy each plan ID (starts with `plan_`) into Railway Variables: `RZP_PLAN_SOLO`, `RZP_PLAN_COUPLE`, `RZP_PLAN_FAMILY`.
2. **Account & Settings → API Keys → Generate key**. Copy Key ID into `RAZORPAY_KEY_ID` and Key Secret into `RAZORPAY_KEY_SECRET`.
3. **Account & Settings → Webhooks → Add new webhook**:
   - URL: `https://yourdomain.in/api/billing/webhook`
   - Secret: make up a long password; put the same text in Railway's `RAZORPAY_WEBHOOK_SECRET`
   - Events: tick every **subscription.\*** event
4. Save the Railway variables (it redeploys in about a minute). On your site, sign in, open **Premium**, buy Solo with a Razorpay test card or test UPI ID. Your plan should change to Solo straight away and appear in `/admin`.
5. When test mode works, complete Razorpay KYC, switch the dashboard to **Live mode**, create the same three plans and a new webhook there, and replace all Razorpay values in Railway with the live ones.

Check that the plan prices you set in Razorpay are GST-inclusive the way your CA advises. The app shows ₹49 / ₹99 / ₹199 as the price the customer pays.

## Step 8: Before you tell anyone

- [ ] A lawyer reviews `/privacy` and `/terms` (drafts are included, with [brackets] to fill in).
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
| Domain | about ₹1,000 a year |
| Google sign-in | free |

Full figures and break-even are in `docs/Rekha_Cost_Model.xlsx`.

## Every week: 10 minutes

Open `/admin` and look at: new users, paying users, MRR, AI cost this month, AI budget used, and the average cost per reading type. If AI cost per user rises, lower the monthly limits in `src/plans.js` (or ask Claude to change them).

The biggest single AI cost is the paid full reading on the Sonnet model (about ₹1.6 each). To cut it by about 95%, add the variable `MODEL_REPORT=claude-haiku-5-5` in Railway. Compare a few readings in Hindi and English first; if the quality is good enough for your users, keep it.

## If something goes wrong

| Problem | Fix |
|---|---|
| "Sign-in is not configured" | `GOOGLE_CLIENT_ID` is missing in Railway Variables |
| Google button says origin not allowed | Add your exact site address to Authorized JavaScript origins (Step 6) |
| "Payments are not set up yet" | One of the Razorpay values or plan IDs is missing in Railway Variables |
| Paid but plan did not change | Check the webhook URL and secret match (Step 7.3); Razorpay shows webhook delivery logs |
| Readings say "Demo" | `ANTHROPIC_API_KEY` is empty, or your Anthropic credit ran out |
| "AI readings are paused" | The monthly AI budget is used up: raise `AI_MONTHLY_BUDGET_USD` in Railway Variables |
| Deploy fails with "No storage volume attached" | Attach a volume with mount path `/data` (Step 4.2), then redeploy |
| Site down for a few seconds after each change | Normal: Railway briefly stops the app to move the volume to the new version |
| Users or subscriptions disappeared | Restore yesterday's backup: service → **Backups** → **Restore** → **Deploy** |

To change prices later: create new plans in Razorpay, update the plan IDs in Railway Variables, and change `priceInr` in `src/plans.js`. Existing subscribers stay on their old price until they switch.
