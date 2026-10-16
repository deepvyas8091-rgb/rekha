// About Rekha: how it works, what it never does. Linked from the plans screen, every
// reading and the footer (short link: /trust). Keep every line true: if the product
// changes, change this page in the same release.
export default [
  {
    slug: 'how-rekha-works',
    title: 'How Rekha Works: Calculations, AI Readings and What We Never Do',
    description: 'How Rekha calculates your timings and chart, how its AI writes readings from those facts, and its promises: no wallet, no per-minute fees, no gemstones.',
    h1: 'How Rekha works, and what it never does',
    category: 'About Rekha',
    tool: ['Open the free app', '/'],
    related: ['lagna-vs-rashi-vs-sun-sign', 'daily-horoscope-how-it-works', 'palm-reading-lines'],
    body: `
Rekha does two separate things. It **calculates** (your city's timings, the Panchang, your birth chart), and it **writes** readings from those calculations with AI. This page explains both, and what Rekha will never do.

## No wallet, no per-minute fees, no shop

- There is **no wallet** and nothing to top up. You never pay per minute or per question.
- Rekha **sells no gemstones, pujas, remedies or products**, and its readings are told never to recommend paid remedies.
- There are **no ads**.
- The free tools stay free without an account: Choghadiya, Rahu Kaal, Hora, Panchang, the festival calendar, your kundli, the matching score and the daily horoscope.
- Premium is **one flat price** per month or per year, shown before you sign up, in your local currency where available. You can cancel from your account at any time and keep premium until the end of the period you paid for.

## You see your results before you pay

You can scan your palm and your face, and get a short reading from your birth details, **without creating an account**. An account only saves your profiles so you do not have to enter them again. You can see a sample of a full premium reading on the plans screen before you choose a plan.

## Readings are written by AI, and say so

There are **no human astrologers** in Rekha, and Rekha never presents its AI as a person. Every reading is labelled as AI-written.

The AI does not decide anything about your chart. First Rekha calculates the facts: your ascendant, Moon sign, nakshatra, planets and houses, current dasha, Sade Sati, palm lines and face proportions. The AI is then given **only those facts** and asked to explain them in plain words, in your language. Under every section of a reading you will see **Based on**, listing the exact facts that section was written from, so you can check it against your own kundli.

The AI follows fixed rules:

- Never claim certainty about the future.
- Never predict death, accidents, serious illness, divorce or exam results.
- Never use fear, or say that a planet or dosha will "destroy" anything.
- Never recommend paid remedies or gemstones. If you ask, it says they are optional traditions.
- Say plainly what it could not see, for example a palm line that is not visible in the photo.

## How the timings and chart are calculated

- Planet positions are calculated astronomically for your exact date, time and place, then converted to the sidereal zodiac with the **Lahiri ayanamsa**, the standard used by most Indian almanacs.
- Choghadiya, Rahu Kaal, Hora and the other daily periods start from **your city's sunrise and sunset**, and the Hindu day runs from sunrise to sunrise.
- The calculations are tested against published reference values from a widely used almanac for sample dates and cities.
- Different traditions and regions use slightly different rules, so another almanac can differ from Rekha by a few minutes.

## Why your sign may differ from other apps

Western astrology and most magazine horoscopes use the **tropical** zodiac. Indian astrology uses the **sidereal** zodiac, which today starts about 24 degrees earlier. That is why most people's Indian Sun sign is one sign before their Western sun sign. Rekha's daily horoscope uses your **Moon sign (rashi)**, the Indian way, and your Kundli shows all three signs side by side. [Lagna, rashi and sun sign explained](/insights/lagna-vs-rashi-vs-sun-sign).

## Your photos

- **Palm:** the photo is sent to the AI service only to read the lines. Rekha keeps it in memory for that moment and does not store it. Only the result (for example "heart line: long, curved") is saved to your profile, and only if you are signed in.
- **Face:** the photo never leaves your phone. Your phone measures the proportions and only those numbers are sent.
- You can delete your account, every profile, scan and reading at any time from your account.

## What a reading is for

Rekha is for entertainment and self-reflection. It is not medical, legal or financial advice. For decisions about health, money or the law, please speak to a qualified professional.
`,
    faq: [
      ['Is Rekha a real astrologer?', 'No. Rekha calculates your chart and timings, and an AI explains those calculations in plain words. Every reading is labelled as AI-written and shows the facts it is based on. There are no human astrologers and no pretend ones.'],
      ['Do I have to pay to see my palm reading?', 'No. You can scan your palm and your face without an account and see the full result. Premium adds daily personal guidance, full readings and more questions each month.'],
      ['Will Rekha ask me to buy gemstones or remedies?', 'No. Rekha sells no gemstones, pujas or products, and its readings are told never to recommend paid remedies.'],
      ['Can I cancel premium?', 'Yes, at any time from your account. You keep premium until the end of the month or year you paid for, and there is no wallet balance to lose.'],
    ],
  },
];
