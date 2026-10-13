# Rekha: AI palm, face and horoscope reader

Web-first app (installable PWA) for India and Southeast Asia. It combines:

- **Good and bad time engine**: Choghadiya (day and night), Rahu Kaal, Yamaganda, Gulika Kaal, Dur Muhurtam, Bhadra, Panchak, Abhijit, Brahma, Vijaya, Godhuli, Nishita, Sandhya, 24 Horas, and a "best window for this activity" finder (business, travel, marriage, purchase, property, government, education, health).
- **Panchang**: tithi, nakshatra, yoga, karana with end times, sunrise and moonrise, amanta and purnimanta month, Adhika masa, paksha, ritu, ayana, Vikram and Shaka samvat, major festivals.
- **Month calendar**: every day scored for a chosen activity, personalised with Tarabalam and Chandrabalam once the user adds a birth chart.
- **Kundli**: sidereal (Lahiri) planets, lagna, whole-sign houses, navamsa, Vimshottari dasha with antardasha, Manglik, Sade Sati and Dhaiya, live transits.
- **Kundli matching**: Ashtakoota 36-gun with doshas.
- **Southeast Asia and diaspora**: Chinese BaZi four pillars and five elements, Chinese and Vietnamese zodiac, Thai birth-day colour and colour of the day, Western sun sign, Pythagorean and Chaldean numerology.
- **Palm scan**: hand shape and finger ratios from on-device MediaPipe landmarks, plus palm lines read by a vision model into strict JSON. A rules engine (not the AI) decides the meaning, so the same palm always reads the same way.
- **Face reading**: only facial proportions leave the phone, never the photo. Mian Xiang face types and three courts. Hard guardrails: never skin colour, looks, age, ethnicity or health.
- **Combined AI reading in 15 languages**, follow-up chat, share card for Instagram and WhatsApp status.
- **Safety**: distress messages get a helpline response instead of a reading; no fear-based upsell; entertainment framing.
- **Free daily rashi horoscope** for all 12 Moon signs, from real transits (Gochar), written once per sign per day and shared by everyone.
- **SEO and AI-search layer**: 25 Insights articles (about 10,800 words), daily Choghadiya, Rahu Kaal and Panchang pages for 40 cities, 12 daily horoscope pages, FAQ and Article structured data, sitemap.xml, robots.txt open to AI crawlers, and llms.txt. About 165 public pages that refresh daily.
- **Installable app (PWA)**: Android install prompt, iPhone "Add to Home Screen" guide, offline start, app shortcuts.
- **Business layer**: mobile number + password sign-up (no OTP, scrypt hashing, lockout after 5 wrong tries, owner reset), Google sign-in, family profiles, Free / Solo ₹49 / Couple ₹99 / Family ₹199 monthly plans on Razorpay Subscriptions, fair-use limits, cancellation with paid-days grace, plan switching, account deletion, and an owner dashboard at `/admin`.

**To launch without a developer, follow `LAUNCH.md`.**

## Plans

| | Free | Solo ₹49 | Couple ₹99 | Family ₹199 |
|---|---|---|---|---|
| Profiles | 1 | 1 | 2 | 4 |
| Today, Panchang, calendar, kundli, match score, face reading | ✓ | ✓ | ✓ | ✓ |
| Personal day rating, personal best times and calendar | | ✓ | ✓ | ✓ |
| Daily AI guidance | | every day per profile | every day per profile | every day per profile |
| AI palm scans / full readings per month | 1 / 1 | 4 / 4 | 8 / 8 | 16 / 16 |
| Ask Rekha questions per month | 3 | 60 | 120 | 240 |
| Match explanations per month | | 10 | 20 | 40 |

Limits live in `src/plans.js` and reset on the 1st of each month.

## Run it

```bash
npm install
npm test          # 39 tests: Panchang reference checks, plans, payments, sign-up, AI costs, and a crawl of every public page
npm start         # http://localhost:3000
```

Set `DEV_LOGIN=1` locally for a test sign-in box. Without `ANTHROPIC_API_KEY` the app runs in **demo mode**: everything works except the AI-written prose, which falls back to the rule engine's facts. Copy `.env.example` to `.env` and export the variables to go live.

## Architecture

```
public/            PWA: index.html, app.js (no build step), styles.css, sw.js
src/engine/        Astrology engine, pure JS, no AI, no paid API
  astro.js         positions, Lahiri ayanamsa, ascendant, rise/set (astronomy-engine, MIT)
  panchang.js      five limbs, month, festivals (observance-time rules)
  muhurta.js       Choghadiya, Rahu Kaal etc., Hora, best windows, month calendar
  kundli.js        chart, dasha, Manglik, Sade Sati, transits
  matching.js      Ashtakoota gun milan
  world.js         BaZi, Thai, Western, numerology
src/readings/      Deterministic palm and face rule engines
src/ai/reader.js   Claude calls: palm vision (Sonnet), reports (Sonnet), daily + chat (Haiku)
src/server.js      Express API
src/db.js          SQLite (Node built-in): users, profiles, usage, AI cost log, payment events
src/auth.js        Google sign-in + signed session cookie
src/billing.js     Razorpay subscribe / verify / cancel / webhook
src/plans.js       Prices, profile counts and monthly limits
public/admin.html  Owner dashboard (users, MRR, AI cost, customer search and password reset)
public/guide.js    Plain-language explanations shown in the app
src/engine/horoscope.js   Daily rashi horoscope from transits
src/content/       Insights articles (Markdown in JS; the source of truth)
src/seo/           Server-rendered public pages, sitemap, robots.txt, llms.txt
railway.json       Railway build and start settings (attach a volume at /data)
LAUNCH.md          Click-by-click launch guide
docs/Rekha_Cost_Model.xlsx   Build and running cost model
```

Why this split: the astrology engine costs nothing per request and runs in about 10 ms, so the free tier (Today, Panchang, Chart, Match scores) has near-zero marginal cost. AI is only used where it adds value (reading palm photos, writing prose in the user's language).

## API

Free (no sign-in): `GET /api/timings`, `/api/panchang`, `/api/calendar`, `POST /api/profile`, `POST /api/match` (score), `POST /api/face`, `POST /api/palm` (hand shape only).

Signed in: `GET/DELETE /api/me`, `POST/PATCH/DELETE /api/profiles`, `GET /api/profiles/:id/chart`, `POST /api/palm` (photo), `POST /api/reading`, `POST /api/ask`, `GET /api/daily/:profileId` (paid), `POST /api/billing/subscribe|verify|cancel`.

Personal timings: add `&profile=<id>` to `/api/timings` or `/api/calendar` (paid plans; free users get `personalLocked: true`).

Other: `POST /api/billing/webhook` (Razorpay, signature-checked), `GET /api/admin/stats` (header `x-admin-token`).

## Languages

15 languages, each under its own URL prefix (`/hi/`, `/gu/`, ... English at the root), with `hreflang`, per-script Google Fonts and a language menu on every page.

- `src/i18n/languages.js`: the language list, locales and fonts.
- `src/i18n/catalog.js`: reads every translatable string from the source at startup: `t('...')` / `N('...')` in `public/app.js`, `data-i18n` in `index.html`, the explanations in `guide.js`, `t(lang, '...')` / `tt('...')` in the page templates, and the names the engine sends (tithis, Choghadiya, palm meanings). Strings are keyed by their English text, so anything untranslated falls back to English.
- `src/i18n/packs/hi.js`, `gu.js`, `glossary.js`: hand-written Hindi and Gujarati interface, page text and names.
- `src/i18n/jobs.js`: background job that machine-translates whatever is missing (Haiku, stored in the `translations` table), plus export/import for native review. Reviewed lines are never overwritten.
- `src/i18n/shell.js`: server-side translation of the app shell, hreflang tags, the language menu and language-prefixed links.
- Client: `public/i18n.js` loads `/api/i18n/:lang` and provides `t()` (interface) and `d()` (server values).

New text in the app: wrap it in `t('...')`. It is picked up on the next start and translated by the job; add it to `hi.js` and `gu.js` by hand for those two (a test fails if they are incomplete).

## Adding an Insights article

Add an object to one of the files in `src/content/` (slug, title under 70 characters, description of 90 to 170 characters, h1, category, tool link, related slugs, body in simple Markdown, and at least two FAQs). It appears in /insights, the sitemap, llms.txt and the footer automatically. `npm test` checks lengths, broken links and structured data.

## AI cost controls

| Control | What it does |
|---|---|
| Rules engine first | Timings, panchang, kundli, matching scores and face measurements never call the AI. |
| Cheapest model | Claude Haiku 5.5 for every AI call: palm photos, readings, daily guidance and chat. Set `MODEL_VISION` / `MODEL_REPORT` / `MODEL_CHAT` (e.g. `claude-sonnet-5-5`) in Railway to upgrade any one of them. |
| Saved readings reused | An unchanged reading is shown again free (no API call, no allowance used). |
| Palm results cached | The same photo is never sent twice (stored 90 days in the database). |
| Daily guidance cached | Written once per profile per day per language. |
| Prompt caching | Palm-scan instructions (~930 tokens, shared by all users) are cached once scans are frequent enough to pay off; chat follow-ups reuse the earlier conversation at the cache price. `AI_CACHE=auto` (default), `always` or `never`. |
| Monthly budget | `AI_MONTHLY_BUDGET_USD`: free-tier AI pauses at 80%, all AI at 100%. |
| Plan limits | Per-profile monthly caps in `src/plans.js`. |
| Exact cost log | Every call is logged with cache reads and writes; see `/admin`. |

Prompt caching is only applied when it saves money. A cache write costs 1.25x the normal input price and a read 0.1x on Haiku 5.5 (0.05x on Sonnet 5.5), so caching only pays when the same prompt repeats within 5 minutes. The reading instructions (~260 tokens) are below Anthropic's 512-token minimum and are not cached; padding them to qualify would cost more than it saves at launch traffic.

## Accuracy

Verified against Drik Panchang for Vadodara, 12 Oct 2026: sunrise, sunset, tithi, nakshatra, yoga and karana end times, Rahu Kaal, Yamaganda, Gulika, both Dur Muhurtams, Abhijit, Brahma, Vijaya, Godhuli and Nishita all within 1 to 4 minutes. Festival rules land Diwali 2026 on 8 November, Janmashtami on 4 September and Dussehra on 21 October. These are locked in `test/engine.test.js`.

Known approximations:
- Lahiri ayanamsa uses a linear model (well under 1 arc-minute error for 1900 to 2100).
- Rahu and Ketu use the mean node (Drik Panchang offers both mean and true).
- Moonrise can differ by a few minutes from almanacs (definition of the visible limb).

## Before launch: items for the astrology consultant

Search the code for `VERIFY` and `TUNE`:
1. Vashya and Yoni tables in `matching.js` (Yoni is simplified to same / enemy / other).
2. Dur Muhurtam table and activity nakshatra lists in `muhurta.js`.
3. Festival table in `panchang.js` (regional calendars differ, e.g. Gujarati new year).
4. Thai lucky and avoid colour lists in `world.js`.
5. Palm and face thresholds in `src/readings/` (calibrate on a diverse, consented sample).
6. Helpline number in `src/ai/reader.js` (Tele-MANAS 14416); add SEA numbers per country.

## Roadmap (not built yet)

- WhatsApp daily message via a BSP (the `/api/timings` + `narrate('daily')` output is ready to send).
- Amrit Kaal and Varjyam (need nakshatra thyajya tables), Lagna table, Panchaka rahita muhurta.
- Own palm line segmentation model to replace the vision call (see cost model, Phase 2).
- Native apps: wrap the PWA with Capacitor, or rebuild screens in React Native.
- Human expert chat marketplace and spiritual products store (Phase 3).
- Full city search (GeoNames) instead of the starter city list.

## App Store note

Apple's guideline 4.3(b) rejects fortune-telling apps that duplicate existing ones. The differentiators to lead with in review notes: the deterministic engine verified against a reference almanac, on-device face processing, multi-tradition combined profile, and the safety guardrails. Launch web-first either way.
