// Insights: Panchang and Kundli.
export default [
  {
    slug: 'what-is-panchang',
    title: 'What Is Panchang? The Five Limbs of the Hindu Calendar',
    description: 'Panchang explained simply: tithi, vara, nakshatra, yoga and karana, why the Hindu day starts at sunrise, and how to read today\'s Panchang.',
    h1: 'What is Panchang?',
    category: 'Panchang',
    tool: ['Today\'s Panchang for your city', '/panchang'],
    related: ['tithi-explained', 'nakshatra-list-meaning', 'yoga-and-karana'],
    body: `
Panchang (Panchangam in South India) is the traditional Hindu almanac. The name means "five limbs", after the five pieces of information it gives for each day. Families use it to find festival dates, fasting days and good times for important events.

## The five limbs

| Limb | What it is | What it is used for |
|---|---|---|
| Tithi | The lunar day (30 in a month) | Festivals, fasts, ceremonies |
| Vara | The weekday | Which planet rules the day |
| Nakshatra | The Moon's star (27 in all) | Suitability of the day for different work |
| Yoga | A Sun and Moon combination (27) | Whether the day is favourable |
| Karana | Half a tithi (11 types) | Fine-tuning; avoiding Bhadra |

Each limb has its own article: [tithi](/insights/tithi-explained), [nakshatra](/insights/nakshatra-list-meaning), [yoga and karana](/insights/yoga-and-karana).

## Why the Hindu day starts at sunrise

In the Panchang the day begins at sunrise, not midnight. The tithi, nakshatra and yoga "of the day" are the ones running at sunrise in your city. This is why two cities can show slightly different Panchangs, and why a festival can fall on different calendar dates in India and abroad.

## Amanta and Purnimanta months

India uses two ways of ending a lunar month:

- **Amanta**: the month ends on Amavasya (new moon). Used in Gujarat, Maharashtra, Karnataka, Andhra Pradesh, Telangana and Tamil Nadu.
- **Purnimanta**: the month ends on Purnima (full moon). Used in most of North India.

The festivals fall on the same days either way; only the month names around them differ for half of each month.

## Other things in a daily Panchang

A full Panchang also shows sunrise, sunset, moonrise, the Moon sign, the season (ritu), the Sun's half-year (Uttarayana or Dakshinayana), the Vikram and Shaka Samvat years, and daily periods to avoid, like Rahu Kaal.

## How to read a Panchang entry

Panchangs often show entries like "Dwitiya upto 22:13". This means the Dwitiya tithi is running at sunrise and ends at 10:13 pm, after which Tritiya begins. The same format is used for nakshatra, yoga and karana. If the time is after midnight, many almanacs write it as "upto 25:30" (1:30 am the next day) or add "next day".

## Panchang and festivals

Festival dates are set by the tithi at a particular time of day, not always at sunrise. Diwali is set by the tithi at dusk (Pradosh), Janmashtami by the tithi at midnight, and most fasts by the tithi at sunrise. This is why some festivals appear on different dates in different calendars and why Rekha calculates them for your city.
`,
    faq: [
      ['What are the 5 parts of Panchang?', 'Tithi (lunar day), vara (weekday), nakshatra (the Moon\'s star), yoga (a Sun and Moon combination) and karana (half a tithi).'],
      ['Why is my Panchang different from my relative\'s abroad?', 'The Panchang is calculated from local sunrise, so the tithi or nakshatra at sunrise can differ between places.'],
      ['Which is correct, Amanta or Purnimanta?', 'Both are traditional and correct. They only differ in where the month boundary falls.'],
    ],
  },
  {
    slug: 'tithi-explained',
    title: 'Tithi Explained: List of 30 Tithis, Paksha and Their Meaning',
    description: 'What a tithi is, how it is calculated, the full list from Pratipada to Purnima and Amavasya, the five tithi groups, and which tithis are avoided.',
    h1: 'Tithi: the lunar day explained',
    category: 'Panchang',
    tool: ['Today\'s tithi for your city', '/panchang'],
    related: ['what-is-panchang', 'nakshatra-list-meaning', 'how-to-choose-an-auspicious-time'],
    body: `
A tithi is a lunar day. Each tithi is the time it takes the Moon to move 12 degrees further away from the Sun. Because the Moon's speed varies, a tithi can last anywhere from about 19 to 26 hours, and it can begin or end at any time of day.

A lunar month has 30 tithis, split into two halves (paksha) of 15.

## Shukla and Krishna paksha

- **Shukla paksha** (bright half): from new moon to full moon, as the Moon waxes. Traditionally better for starting things.
- **Krishna paksha** (dark half): from full moon to new moon, as the Moon wanes. A time for completing, clearing and reflection.

## The 15 tithis of each paksha

1. Pratipada
2. Dwitiya
3. Tritiya
4. Chaturthi
5. Panchami
6. Shashthi
7. Saptami
8. Ashtami
9. Navami
10. Dashami
11. Ekadashi
12. Dwadashi
13. Trayodashi
14. Chaturdashi
15. Purnima (in Shukla paksha) or Amavasya (in Krishna paksha)

## The five tithi groups

| Group | Tithis | Nature |
|---|---|---|
| Nanda | 1, 6, 11 | Joyful: celebrations, arts, new clothes |
| Bhadra | 2, 7, 12 | Steady: practical and health-related work |
| Jaya | 3, 8, 13 | Victory: competitions, decisive action |
| Rikta | 4, 9, 14 | Empty: avoided for new beginnings |
| Purna | 5, 10, 15 | Complete: good for most auspicious work |

Amavasya is reserved for honouring ancestors and is avoided for new beginnings.

## Important tithis

- **Ekadashi** (11th): fasting day for Vishnu devotees, twice a month.
- **Pradosh** (Trayodashi, 13th): evening worship of Shiva.
- **Sankashti Chaturthi** (4th of Krishna paksha): Ganesha fast, broken at moonrise.
- **Purnima**: full moon, good for worship and charity.

## Why a tithi can be "skipped" or repeated

Because tithis do not line up with sunrise, occasionally one tithi starts after one sunrise and ends before the next, so it is never "the tithi at sunrise" and seems to be skipped (kshaya tithi). Sometimes a tithi spans two sunrises and appears twice (adhika tithi). This is why festival dates sometimes need care.

## Tithi and the Moon's phase

You can roughly see the tithi in the sky. Around Shukla Ashtami (the 8th) the Moon is a half disc in the evening sky; on Purnima it is full and rises at sunset; on Krishna Ashtami it is a half disc rising around midnight; on Amavasya it cannot be seen.
`,
    faq: [
      ['How long is a tithi?', 'Between roughly 19 and 26 hours, because the Moon\'s speed changes.'],
      ['Which tithis are not good for new work?', 'The Rikta tithis (Chaturthi, Navami, Chaturdashi) and Amavasya are traditionally avoided.'],
      ['Is Ekadashi on the same day everywhere?', 'Not always. It depends on the tithi at local sunrise, so it can differ by a day between cities and countries.'],
    ],
  },
  {
    slug: 'nakshatra-list-meaning',
    title: '27 Nakshatras List: Lords, Nature and Meaning',
    description: 'All 27 nakshatras with their ruling planets, their nature (fixed, movable, swift, gentle, sharp, fierce, mixed) and what each is good for.',
    h1: 'The 27 nakshatras: list, lords and nature',
    category: 'Panchang',
    tool: ['Find your birth nakshatra free', '/?tab=chart'],
    related: ['vimshottari-dasha', 'kundli-matching-36-gun', 'what-is-panchang'],
    body: `
Nakshatras are the 27 "lunar mansions" of Vedic astrology. The sky is divided into 27 equal sections of 13 degrees 20 minutes, and the Moon passes through roughly one each day. The nakshatra the Moon was in when you were born is your **birth star**, which sets your dasha periods and is used in name selection and marriage matching.

Each nakshatra is divided into 4 padas (quarters) of 3 degrees 20 minutes.

## The full list

| # | Nakshatra | Ruling planet | Nature |
|---|---|---|---|
| 1 | Ashwini | Ketu | Swift |
| 2 | Bharani | Venus | Fierce |
| 3 | Krittika | Sun | Mixed |
| 4 | Rohini | Moon | Fixed |
| 5 | Mrigashira | Mars | Gentle |
| 6 | Ardra | Rahu | Sharp |
| 7 | Punarvasu | Jupiter | Movable |
| 8 | Pushya | Saturn | Swift |
| 9 | Ashlesha | Mercury | Sharp |
| 10 | Magha | Ketu | Fierce |
| 11 | Purva Phalguni | Venus | Fierce |
| 12 | Uttara Phalguni | Sun | Fixed |
| 13 | Hasta | Moon | Swift |
| 14 | Chitra | Mars | Gentle |
| 15 | Swati | Rahu | Movable |
| 16 | Vishakha | Jupiter | Mixed |
| 17 | Anuradha | Saturn | Gentle |
| 18 | Jyeshtha | Mercury | Sharp |
| 19 | Mula | Ketu | Sharp |
| 20 | Purva Ashadha | Venus | Fierce |
| 21 | Uttara Ashadha | Sun | Fixed |
| 22 | Shravana | Moon | Movable |
| 23 | Dhanishta | Mars | Movable |
| 24 | Shatabhisha | Rahu | Movable |
| 25 | Purva Bhadrapada | Jupiter | Fierce |
| 26 | Uttara Bhadrapada | Saturn | Fixed |
| 27 | Revati | Mercury | Gentle |

## What the natures mean

- **Fixed (Dhruva)**: foundations, buying a home, anything meant to last.
- **Movable (Chara)**: travel, vehicles and change.
- **Swift (Kshipra)**: trade, learning, starting treatment, quick tasks.
- **Gentle (Mridu)**: arts, friendship, romance, new clothes.
- **Mixed (Mishra)**: routine and practical work.
- **Sharp (Tikshna)** and **Fierce (Ugra)**: not for auspicious events; suited to difficult or decisive tasks.

## Your birth nakshatra

To know yours you need your date, time and place of birth. Rekha calculates it free in [Kundli](/?tab=chart), along with your nakshatra pada and the dasha it starts.
`,
    faq: [
      ['How many nakshatras are there?', '27, each spanning 13 degrees 20 minutes of the zodiac. Some systems add a 28th, Abhijit, for muhurta.'],
      ['Which nakshatra is best for buying a house?', 'Fixed nakshatras such as Rohini, Uttara Phalguni, Uttara Ashadha and Uttara Bhadrapada are traditionally preferred.'],
    ],
  },
  {
    slug: 'yoga-and-karana',
    title: 'Yoga and Karana in Panchang: Meaning, List and Bhadra',
    description: 'The 27 Panchang yogas and 11 karanas explained, which yogas are inauspicious, and why Vishti karana (Bhadra) is avoided for ceremonies.',
    h1: 'Yoga and karana in the Panchang',
    category: 'Panchang',
    tool: ['Today\'s yoga and karana', '/panchang'],
    related: ['what-is-panchang', 'tithi-explained', 'yamaganda-gulika-dur-muhurtam'],
    body: `
Yoga and karana are the two Panchang limbs people know least, but both appear in every almanac and both matter when choosing a time.

## Yoga

Here "yoga" does not mean the exercise. It is the combined position of the Sun and Moon: their longitudes are added together and the result is divided into 27 equal parts. Each part is one yoga, lasting roughly a day.

Most yogas are favourable. Nine are traditionally avoided for new beginnings: **Vishkambha, Atiganda, Shula, Ganda, Vyaghata, Vajra, Vyatipata, Parigha and Vaidhriti**. Vyatipata and Vaidhriti are considered the most severe.

Some of the best-known good yogas are Siddhi, Siddha, Shubha, Saubhagya and Shobhana.

## Karana

A karana is half a tithi, so there are two karanas in each lunar day. There are 11 karanas in all:

- 7 movable karanas that repeat in a cycle: Bava, Balava, Kaulava, Taitila, Garaja, Vanija and Vishti
- 4 fixed karanas that occur once a month around the new moon: Shakuni, Chatushpada, Naga and Kimstughna

## Bhadra (Vishti karana)

Vishti, also called **Bhadra**, is the one karana everyone watches. It is considered unfavourable for ceremonies, travel and new ventures. Festivals such as Raksha Bandhan and Holika Dahan are specifically timed to avoid Bhadra. Because a karana lasts around 12 hours, Bhadra can cover a large part of a day.

Rekha lists Bhadra under "Avoid today" whenever it falls in your day.

## How yoga is calculated, with an example

Suppose the sidereal Sun is at 175 degrees and the Moon at 200 degrees. Their sum is 375 degrees, which wraps around to 15 degrees. Each yoga spans 13 degrees 20 minutes, so 15 degrees falls in the 2nd yoga, Priti. When the sum passes 26 degrees 40 minutes, the yoga changes to Ayushman.

## The 27 yogas in order

Vishkambha, Priti, Ayushman, Saubhagya, Shobhana, Atiganda, Sukarma, Dhriti, Shula, Ganda, Vriddhi, Dhruva, Vyaghata, Harshana, Vajra, Siddhi, Vyatipata, Variyana, Parigha, Shiva, Siddha, Sadhya, Shubha, Shukla, Brahma, Indra and Vaidhriti.

## How karanas repeat through the month

The first half of Shukla Pratipada is always Kimstughna. After that the seven movable karanas repeat in order (Bava, Balava, Kaulava, Taitila, Garaja, Vanija, Vishti) eight times. The last three halves of the month, around Krishna Chaturdashi and Amavasya, are Shakuni, Chatushpada and Naga.

## Bhadra and festivals

Because Vishti returns every few days, festival timings often depend on it. Raksha Bandhan rakhi-tying is done after Bhadra ends, and Holika Dahan is performed in the evening when Bhadra is not active. If Bhadra covers the whole evening, almanacs use special rules, which is why Holika Dahan times sometimes look unusual.
`,
    faq: [
      ['How many yogas are there in Panchang?', '27, based on the combined longitudes of the Sun and Moon.'],
      ['What is Bhadra in Panchang?', 'Bhadra is Vishti karana, a half-tithi period traditionally avoided for ceremonies and new starts.'],
    ],
  },
  {
    slug: 'lagna-vs-rashi-vs-sun-sign',
    title: 'Lagna vs Rashi vs Sun Sign: What Is the Difference?',
    description: 'Ascendant (lagna), Moon sign (rashi) and sun sign explained, why your Indian sign differs from your Western one, and which to use for horoscopes.',
    h1: 'Lagna, rashi and sun sign: what is the difference?',
    category: 'Kundli',
    tool: ['Find your lagna and rashi free', '/?tab=chart'],
    related: ['nakshatra-list-meaning', 'vimshottari-dasha', 'sade-sati'],
    body: `
People often ask "what is my sign?" and get three different answers. In Vedic astrology all three exist and mean different things.

## Lagna (ascendant)

The lagna is the zodiac sign rising on the eastern horizon at the exact moment and place of your birth. It changes about every two hours, so it needs an accurate birth time. The lagna describes your body, personality and how you meet the world, and it decides which sign falls in each of the 12 houses of your chart.

## Rashi (Moon sign)

Your rashi is the sign the Moon was in when you were born. The Moon changes sign every two to two and a half days. In India the rashi is the sign used for daily horoscopes, Sade Sati and naming. It describes your mind and emotions.

## Sun sign

The sun sign is the sign the Sun was in at birth. It is the sign used in Western astrology and most magazine horoscopes.

## Why your Indian and Western signs differ

Vedic astrology uses the **sidereal** zodiac, tied to the fixed stars. Western astrology uses the **tropical** zodiac, tied to the seasons. Because of the slow wobble of the Earth's axis, the two zodiacs have drifted apart by about 24 degrees today (the difference is called the ayanamsa). So a person born on 20 April is Taurus in Western astrology but usually Mesha (Aries) by the Sun's sidereal position.

## Which one should you follow?

- For Indian daily horoscopes and Sade Sati: your **rashi** (Moon sign).
- For your personality and life areas: your **lagna**.
- For Western horoscopes: your **sun sign**.

Rekha's Kundli shows all three, and its daily horoscope uses your rashi.

## A worked example

Take someone born on 15 May 1990 at 8:30 am in Ahmedabad:

| What | Sign | How it is found |
|---|---|---|
| Lagna | Mithuna (Gemini) | Sign rising in the east at 8:30 am in Ahmedabad |
| Rashi | Dhanu (Sagittarius) | Where the Moon was that morning |
| Western sun sign | Taurus | Tropical Sun on 15 May |
| Sidereal Sun | Vrishabha (Taurus), just entered | Sun's sidereal position |

So this person reads "Dhanu" for Indian daily horoscopes, "Taurus" for Western ones, and their personality is described mainly through a Gemini lagna. None of these is wrong; they answer different questions.

## What if you do not know your birth time?

Without a time you can still find your rashi in most cases, because the Moon stays in one sign for about two days. Your lagna and houses, however, cannot be known reliably. Astrologers sometimes use the time of sunrise as a fallback, but readings based on it should be taken lightly.
`,
    faq: [
      ['Which sign is used for Indian horoscopes?', 'The rashi, which is your Moon sign.'],
      ['Why do I need the exact birth time?', 'The lagna changes about every two hours, so a wrong time can give a different ascendant and house placements.'],
    ],
  },
  {
    slug: 'vimshottari-dasha',
    title: 'Vimshottari Dasha Explained: Mahadasha and Antardasha',
    description: 'How the 120-year Vimshottari dasha system works, the length of each planet\'s mahadasha, what antardasha means, and how your starting dasha is found.',
    h1: 'Vimshottari dasha: the timeline of your chart',
    category: 'Kundli',
    tool: ['See your current dasha free', '/?tab=chart'],
    related: ['nakshatra-list-meaning', 'sade-sati', 'lagna-vs-rashi-vs-sun-sign'],
    body: `
If your birth chart is a map, the dasha system is the timeline that tells you which parts of the map are active now. Vimshottari dasha is the most widely used dasha system in India.

## A 120-year cycle

Vimshottari divides a full life cycle of 120 years among the nine planets, always in this order:

| Planet | Mahadasha length |
|---|---|
| Ketu | 7 years |
| Venus | 20 years |
| Sun | 6 years |
| Moon | 10 years |
| Mars | 7 years |
| Rahu | 18 years |
| Jupiter | 16 years |
| Saturn | 19 years |
| Mercury | 17 years |

## Where your dasha starts

Your starting dasha is set by your **birth nakshatra**. Each nakshatra is ruled by one of the nine planets (Ashwini by Ketu, Bharani by Venus, and so on). You are born into that planet's mahadasha, and how far the Moon had travelled through the nakshatra decides how much of it is left.

## Mahadasha and antardasha

- The **mahadasha** is the main period, lasting 6 to 20 years.
- Each mahadasha is divided into nine **antardashas** (sub-periods), one for each planet in the same order, starting with the mahadasha planet itself.
- The antardasha length is proportional to that planet's years. For example, within a 20-year Venus mahadasha, the Sun antardasha lasts 1 year.

## What each period tends to bring

- **Ketu**: inward, spiritual, letting go
- **Venus**: relationships, comforts, creativity
- **Sun**: recognition, authority, confidence
- **Moon**: emotions, home, travel, the public
- **Mars**: action, property, courage
- **Rahu**: ambition, big changes, foreign links
- **Jupiter**: growth, learning, children, fortune
- **Saturn**: hard work, discipline, lasting results
- **Mercury**: business, study, communication

The real effect depends on where the planet sits in your chart and how strong it is, which is why the same dasha feels very different for different people.

## A worked example

Suppose the Moon was at the start of Uttara Ashadha (ruled by the Sun) at birth, a quarter of the way through. Three quarters of the Sun's 6-year mahadasha remain at birth, so the first dasha lasts 4.5 years. Then follow Moon (10 years), Mars (7), Rahu (18), Jupiter (16) and so on in the fixed order.

## Pratyantardasha and further levels

Each antardasha can be divided again into nine pratyantardashas, and further into sookshma and prana dashas, for very fine timing. Most readings use only the first two levels, mahadasha and antardasha.
`,
    faq: [
      ['How do I know my current mahadasha?', 'It is calculated from your birth nakshatra and the Moon\'s exact position. Rekha\'s Kundli shows your current mahadasha and antardasha free.'],
      ['Is Saturn mahadasha always difficult?', 'No. It rewards discipline and hard work, and can be very productive if Saturn is well placed in your chart.'],
    ],
  },
  {
    slug: 'sade-sati',
    title: 'Sade Sati 2026: Meaning, Phases and Which Signs Are Affected',
    description: 'What Shani Sade Sati is, its three phases, which Moon signs are in Sade Sati and Dhaiya with Saturn in Pisces (2025 to 2027), and how to approach it.',
    h1: 'Sade Sati: Saturn\'s seven and a half years',
    category: 'Kundli',
    tool: ['Check your Sade Sati status free', '/?tab=chart'],
    related: ['vimshottari-dasha', 'lagna-vs-rashi-vs-sun-sign', 'daily-horoscope-how-it-works'],
    body: `
Sade Sati ("seven and a half") is the period of about seven and a half years when Saturn passes through three signs: the sign before your Moon sign, your Moon sign itself, and the sign after it. Saturn spends about two and a half years in each sign.

## The three phases

1. **Rising phase**: Saturn in the 12th sign from your Moon. Often linked with expenses, travel and restlessness.
2. **Peak phase**: Saturn over your Moon sign. The most intense phase for responsibility and emotional pressure.
3. **Setting phase**: Saturn in the 2nd sign from your Moon. Focus shifts to family, finances and speech.

## Who is in Sade Sati now?

Saturn entered Pisces (Meena) in March 2025 and is expected to stay there until mid-2027. During this time:

| Moon sign | Status |
|---|---|
| Aquarius (Kumbha) | Sade Sati, setting phase |
| Pisces (Meena) | Sade Sati, peak phase |
| Aries (Mesha) | Sade Sati, rising phase |
| Leo (Simha) | Shani Dhaiya (Saturn in 8th) |
| Sagittarius (Dhanu) | Shani Dhaiya (Saturn in 4th) |

Dhaiya (also called Kantaka Shani) is a shorter two-and-a-half-year Saturn period when Saturn is 4th or 8th from the Moon.

## Is Sade Sati always bad?

No. Saturn is the planet of discipline, patience and lasting results. Many people build careers, settle down or mature greatly during Sade Sati. It tends to remove what is not working and reward steady effort. How it feels depends on Saturn's placement in your own chart and the dasha you are running.

## Practical approach

- Keep commitments realistic and avoid shortcuts.
- Look after health and sleep routines.
- Be patient with delays; they often lead somewhere better.
- Traditional practices include Saturday prayers and service to others. These are optional and personal.

Check your own status in Rekha's [Kundli](/?tab=chart), which uses your Moon sign.

## How Sade Sati is calculated

Saturn takes about 29.5 years to go round the zodiac, spending roughly two and a half years in each sign. Sade Sati begins when Saturn enters the sign before your Moon sign and ends when it leaves the sign after. Because Saturn sometimes goes retrograde near a sign boundary, the start and end can stretch over a few months.

Most people go through Sade Sati two or three times in a lifetime, about 30 years apart.

## Sade Sati and your dasha

The effect of Sade Sati depends a lot on the dasha you are running. Sade Sati during a supportive dasha can feel like steady, earned progress; during a challenging dasha it can feel heavier.
`,
    faq: [
      ['Which signs have Sade Sati in 2026?', 'With Saturn in Pisces: Aquarius (setting phase), Pisces (peak phase) and Aries (rising phase), by Moon sign.'],
      ['Is Sade Sati based on sun sign or Moon sign?', 'On the Moon sign (rashi).'],
      ['How long does Sade Sati last?', 'About seven and a half years, in three phases of about two and a half years each.'],
    ],
  },
  {
    slug: 'manglik-dosha',
    title: 'Manglik Dosha: Meaning, Houses and Common Cancellations',
    description: 'What Manglik (Mangal or Kuja) dosha is, which Mars placements cause it, how severity is judged, and the cancellation rules astrologers commonly use.',
    h1: 'Manglik dosha: what it really means',
    category: 'Kundli',
    tool: ['Check Manglik status free', '/?tab=chart'],
    related: ['kundli-matching-36-gun', 'lagna-vs-rashi-vs-sun-sign', 'vimshottari-dasha'],
    body: `
Manglik dosha, also called Mangal dosha or Kuja dosha, is one of the most discussed factors in Indian marriage matching. It is often feared more than it should be.

## What causes it

A person is called Manglik when Mars (Mangal) sits in certain houses of the birth chart: the **1st, 2nd, 4th, 7th, 8th or 12th** house. Some traditions leave out the 2nd house. Mars represents energy, drive and assertiveness, and in these houses it is believed to affect harmony in marriage.

Astrologers check the placement from three points: the lagna (ascendant), the Moon and Venus. If Mars is in one of these houses from the lagna, the dosha is considered stronger; if only from the Moon or Venus, it is often called mild or partial (anshik).

## Commonly cited cancellations

Many rules reduce or cancel the dosha. Among those most often cited:

- Both partners are Manglik.
- Mars is in its own sign (Aries or Scorpio) or exalted (Capricorn).
- Mars is aspected or joined by Jupiter.
- Specific sign and house combinations listed in classical texts.

Because there are so many exceptions, a simple "yes or no" Manglik result should never be the final word.

## A balanced view

Manglik dosha is one factor among many. Gun Milan, the overall strength of both charts, the dashas the couple will run, and above all the people themselves matter far more. Treat a Manglik result as a prompt for a careful, calm consultation, not a reason for fear.

## Why the 7th and 8th houses matter most

Among the Manglik houses, Mars in the 7th (partnership) and 8th (shared resources and longevity) is usually treated as the strongest, because those houses relate directly to married life. Mars in the 1st, 4th or 12th is often read as milder.

## Myths worth correcting

- **"Manglik people should not marry."** Not supported by classical texts; cancellations are common and matching is about the whole chart.
- **"Manglik dosha ends at 28."** This is a widely repeated folk belief rather than a classical rule. Astrologers differ on it.
- **"Remedies are essential."** Traditional rituals such as Kumbh Vivah are optional, personal choices. No reading should pressure anyone into paying for them.

## How Rekha reports Manglik status

Rekha checks Mars from the lagna, the Moon and Venus and reports "Not Manglik", "Mild (Anshik) Manglik" or "Manglik", with a note to confirm cancellation rules with an astrologer.
`,
    faq: [
      ['Which houses make a person Manglik?', 'Mars in the 1st, 2nd, 4th, 7th, 8th or 12th house. Some traditions exclude the 2nd.'],
      ['Can a Manglik marry a non-Manglik?', 'Many astrologers allow it when cancellation rules apply. The full charts should be checked.'],
    ],
  },
  {
    slug: 'kundli-matching-36-gun',
    title: 'Kundli Matching (Gun Milan): The 36 Gunas Explained',
    description: 'How Ashtakoota Gun Milan works: the 8 kootas and their points, what score is considered good, Nadi and Bhakoot dosha, and the limits of the system.',
    h1: 'Kundli matching: how the 36 gunas work',
    category: 'Kundli',
    tool: ['Match two kundlis free', '/?tab=match'],
    related: ['manglik-dosha', 'nakshatra-list-meaning', 'lagna-vs-rashi-vs-sun-sign'],
    body: `
Gun Milan, or Ashtakoota matching, is the traditional first step in comparing two horoscopes for marriage. It uses only the Moon sign and birth nakshatra of each person, and scores eight areas of compatibility for a total of 36 points.

## The eight kootas

| Koota | Points | What it represents |
|---|---|---|
| Varna | 1 | Work and ego compatibility |
| Vashya | 2 | Mutual attraction and influence |
| Tara | 3 | Health and wellbeing |
| Yoni | 4 | Physical and intimate compatibility |
| Graha Maitri | 5 | Mental compatibility and friendship |
| Gana | 6 | Temperament |
| Bhakoot | 7 | Family welfare and finances |
| Nadi | 8 | Health of children and genes |

## What score is good?

- **Below 18**: traditionally not recommended without detailed analysis
- **18 to 24**: acceptable
- **25 to 32**: very good
- **33 to 36**: excellent

A high score does not guarantee a good marriage, and a lower score does not rule one out.

## The important doshas

- **Nadi dosha**: both partners have the same Nadi, giving 0 of 8 points. It is taken seriously, but classical texts list several exceptions.
- **Bhakoot dosha**: certain Moon sign pairings (2-12, 5-9, 6-8 apart) give 0 of 7 points.
- **Gana dosha**: very different temperaments, such as Deva with Rakshasa.

## The limits of Gun Milan

Gun Milan looks only at the Moon. A full compatibility check also looks at both lagnas, the 7th house, Venus, Manglik status and the dashas each person will run in the coming years. Use the score as a starting point for a conversation, not a verdict.

## How the kootas are calculated

Each koota compares one property of the two birth nakshatras or Moon signs:

- **Varna, Vashya, Bhakoot, Graha Maitri** use the Moon signs and their ruling planets.
- **Tara, Yoni, Gana, Nadi** use the birth nakshatras.

For example, Gana sorts the 27 nakshatras into Deva (divine), Manushya (human) and Rakshasa (fierce) temperaments. Two people of the same Gana score the full 6 points.

## North and South Indian matching

North India mostly uses Ashtakoota (36 points). South India often uses Dashakoota or Porutham, which checks ten factors such as Dinam, Ganam, Rasi, Rajju and Vedha, and treats Rajju (similar to Nadi) as especially important. The principles overlap, but scores are not directly comparable between the two systems.

## Using Rekha's matching

Rekha calculates the 36-point Ashtakoota score, shows each koota, and checks Manglik status for both. On Premium plans it adds a plain-language explanation in your language.
`,
    faq: [
      ['How many gunas should match for marriage?', 'Traditionally at least 18 out of 36, though the full charts matter more than the number.'],
      ['What is Nadi dosha?', 'When both partners have the same Nadi, the Nadi koota scores 0 of 8. Astrologers check exceptions before treating it as a problem.'],
    ],
  },
  {
    slug: 'daily-horoscope-how-it-works',
    title: 'How the Daily Rashi Horoscope Works (Gochar Explained)',
    description: 'Indian daily horoscopes are based on Gochar, the transit of planets counted from your Moon sign. How the Moon\'s daily house and other transits shape your day.',
    h1: 'How your daily horoscope is worked out',
    category: 'Kundli',
    tool: ['Read today\'s horoscope', '/horoscope'],
    related: ['lagna-vs-rashi-vs-sun-sign', 'sade-sati', 'tithi-explained'],
    body: `
Most Indian daily horoscopes, including Rekha's, are based on **Gochar**: the current position of the planets counted from your Moon sign (rashi).

## The Moon sets the mood of the day

The Moon changes sign every two to two and a half days, so it is the main driver of daily changes. Counting from your Moon sign, the house the Moon is passing through suggests the theme of the day:

- 1st: feelings close to the surface; self-care
- 3rd: courage, calls and short trips
- 6th: clearing tasks and obstacles
- 7th: partnerships and meetings
- 10th: work in the spotlight
- 11th: gains and good news (one of the best)
- 8th and 12th: go slow, rest, avoid big risks

The 1st, 3rd, 6th, 7th, 10th and 11th houses are traditionally favourable for the Moon. This is the same rule as **Chandrabalam**, used in muhurta.

## Slower planets set the season

Jupiter, Saturn, Rahu and Ketu move slowly, so they shape longer phases. Saturn passing over your Moon sign, for example, is Sade Sati. Classical texts list houses where each planet gives good results, for example 3rd, 6th and 11th for Saturn, and 2nd, 5th, 7th, 9th and 11th for Jupiter.

## How Rekha scores love, career, money and energy

Each area is linked to planets that traditionally signify it (Venus for love, Sun and Saturn for career, Jupiter for money, Mars for energy). Rekha checks whether each is in a favourable house from your Moon sign today and whether the Moon is in a supportive house, then gives a 1 to 5 score. The text is written from these facts.

## Your personal chart matters more

A sign-based horoscope is shared by everyone with the same Moon sign. For a reading based on your own chart, dasha and birth star, use your personal day rating in the Rekha app.

## Why two horoscope sites can disagree

- **Sidereal or tropical**: Indian sites use your sidereal Moon sign; Western sites use your tropical sun sign.
- **Which planets they weigh**: some writers focus on the Moon, others on slower planets.
- **Writing style**: two writers can describe the same transits very differently.

Rekha shows the transit table behind every horoscope on its [horoscope pages](/horoscope), so you can see exactly which planets shaped the day.

## Vedha: when good transits are blocked

Classical Gochar also uses vedha (obstruction): a planet in a good house can be blocked by another planet in a particular house. Rekha's sign horoscope uses the simpler favourable-house rule; a full personal reading considers more.
`,
    faq: [
      ['Is the Indian horoscope based on sun sign?', 'No. Indian daily horoscopes are based on the Moon sign (rashi).'],
      ['Why does my horoscope change every two days?', 'Because the Moon moves into a new sign roughly every two to two and a half days.'],
    ],
  },
];
