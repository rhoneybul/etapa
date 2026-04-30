/**
 * Getting Started guide content — 9 sections covering essential cycling gear and knowledge.
 * Each section has three tiers: minimum, invest, allout.
 * Optional `inventoryKey` links to gearInventory.js for inventory tracking.
 */

export const GETTING_STARTED_SECTIONS = [
  {
    id: 'bike',
    title: 'The bike',
    intro: 'You need a working bike — any working bike.',
    inventoryKey: 'bike',
    tiers: [
      {
        tier: 'minimum',
        body: 'Any working bike will do. Charity shops, Marketplace, or a local bike shop doing a service rebuild — you can find a solid used bike for £100–300. It doesn\'t have to be new or fancy. What matters is it shifts, brakes work, and the tyres hold air.',
        wheresToBuy: 'Charity shops, Facebook Marketplace, local bike shops',
      },
      {
        tier: 'invest',
        body: 'An entry-level road or gravel bike (£600–1500) is a solid choice if you want something built for the kind of riding you\'ll be doing. Road bikes are lighter and faster on pavement. Gravel bikes are more forgiving on rougher surfaces and easier to ride in poor conditions.',
        wheresToBuy: 'Decathlon, Halfords, Wiggle, local independent bike shops',
      },
      {
        tier: 'allout',
        body: 'A high-end bike (£2k+) is lovely, but don\'t worry about it for at least 6 months. Once you\'ve ridden regularly and worked out what type of cycling you love, you\'ll know exactly what to upgrade to. For now, get the basics right and enjoy what you\'ve got.',
        wheresToBuy: 'Specialist bike brands, local bike shops',
      },
    ],
  },

  {
    id: 'helmet',
    title: 'Helmet & safety',
    intro: 'A helmet is non-negotiable.',
    inventoryKey: 'helmet',
    tiers: [
      {
        tier: 'minimum',
        body: 'A £30 Decathlon helmet is rated as well as a £200 one in independent testing. Comfort matters more than price — wear the one that fits your head. The most important thing: a helmet only helps if you actually wear it every ride. Non-negotiable.',
        wheresToBuy: 'Decathlon, Argos, Amazon',
      },
      {
        tier: 'invest',
        body: 'Add a daytime running light to your helmet or bars. Even in daylight, lights make you visible to cars and other road users. A USB rechargeable set (front + rear) costs £30–50 and you can leave them on all day.',
        wheresToBuy: 'Decathlon, Halfords, Amazon',
      },
      {
        tier: 'allout',
        body: 'Mips helmets reduce rotational impacts. GPS crash detection in premium helmets can alert emergency contacts if you have an accident. Nice-to-haves, but only if you\'re riding in heavy traffic regularly.',
        wheresToBuy: 'Specialist cycling retailers',
      },
    ],
  },

  {
    id: 'clothes',
    title: 'Clothes & comfort',
    intro: 'You don\'t need lycra to start. Padded shorts change everything.',
    inventoryKey: 'paddedShorts',
    tiers: [
      {
        tier: 'minimum',
        body: 'Any sportswear works. But if you\'re going to buy one thing, buy padded cycling shorts (£30). Sounds silly until the first ride over an hour — then you\'ll understand why cyclists go on about them. They genuinely change how comfortable longer rides feel.',
        wheresToBuy: 'Decathlon, Halfords, Amazon',
      },
      {
        tier: 'invest',
        body: 'Bib shorts (with braces instead of a waistband) stay in place better than regular shorts. A simple jersey with rear pockets means you always have somewhere for your phone and snacks. Hunt end-of-season sales at Wiggle, Sigma, and Decathlon for deals — you can get full kits for less.',
        wheresToBuy: 'Wiggle, Sigma, Decathlon, Halfords',
      },
      {
        tier: 'allout',
        body: 'Full kit including layers, gloves, and base layers for different seasons. Build this gradually — one piece at a time as you work out what you need. Your riding will tell you what\'s missing.',
        wheresToBuy: 'Specialist cycling brands',
      },
    ],
  },

  {
    id: 'lights',
    title: 'Lights & visibility',
    intro: 'Lights are about being seen.',
    inventoryKey: 'frontLight',
    tiers: [
      {
        tier: 'minimum',
        body: 'A USB rechargeable front + rear set costs £20–40. Charge them at home, clip them on, and you\'re visible to cars and other road users. USB is key — you already have a charger at home.',
        wheresToBuy: 'Decathlon, Amazon, Wiggle',
      },
      {
        tier: 'invest',
        body: 'Daytime running lights stay visible in daylight — crucial if you\'re riding commute hours. UK riders: lights are legally required from sunset, which means November to February you need them.',
        wheresToBuy: 'Decathlon, Halfords, Amazon',
      },
      {
        tier: 'allout',
        body: 'Dynamo lights run off your wheel rotation — no charging. Overkill unless you\'re riding daily in winter.',
        wheresToBuy: 'Specialist cycle shops',
      },
    ],
  },

  {
    id: 'tools',
    title: 'Pump & repair kit',
    intro: 'A puncture will happen eventually. Be ready.',
    inventoryKey: 'trackPump',
    tiers: [
      {
        tier: 'minimum',
        body: 'A track pump at home (£15–30) is the small investment that pays for itself fastest. Tyres lose pressure over time — a good pump means your rides feel snappy and fast. Keep it in your hallway or garage so it\'s always there.',
        wheresToBuy: 'Decathlon, Halfords, Amazon',
      },
      {
        tier: 'invest',
        body: 'A spare tube, tyre levers, and a multitool in a saddle bag (£20–30 total). Watch a YouTube tutorial on changing a tube — it\'s a 5-minute job once you\'ve done it once. Keep this with you on longer rides so you\'re never stranded.',
        wheresToBuy: 'Decathlon, Halfords, Amazon',
      },
      {
        tier: 'allout',
        body: 'Tubeless setup (sealant + rim tape) eliminates most punctures. Worth learning once you\'ve ridden 500+ km and have the skill to mess with it.',
        wheresToBuy: 'Specialist cycle shops',
      },
    ],
  },

  {
    id: 'tech',
    title: 'Tech & data',
    intro: 'Your phone is enough. A bike computer is nice, but optional.',
    inventoryKey: 'bikeComputer',
    tiers: [
      {
        tier: 'minimum',
        body: 'Your phone + Etapa is genuinely all you need to plan and follow your sessions. For ride recording, Strava\'s free tier on your phone covers most beginners — connect it to Etapa and your coach sees what you actually did.',
        wheresToBuy: 'Already in your pocket',
      },
      {
        tier: 'invest',
        body: 'A Garmin or Wahoo bike computer (£200–300) is nice if you like having data at a glance while riding. But your phone works just as well — the main difference is convenience on the bars.',
        wheresToBuy: 'Halfords, Wiggle, Amazon',
      },
      {
        tier: 'allout',
        body: 'A heart-rate strap or power meter. Don\'t buy these until you actually want them — when your current bike computer starts to feel limiting. That\'s the signal you\'re ready.',
        wheresToBuy: 'Specialist cycling retailers',
      },
    ],
  },

  {
    id: 'food',
    title: 'Food & hydration',
    intro: 'Fuel matters less than you think.',
    inventoryKey: 'waterBottle',
    tiers: [
      {
        tier: 'minimum',
        body: 'For rides under 30 minutes: nothing. Just go. For 30–60 minutes: bring water. For over 60 minutes: add a banana, flapjack, or peanut-butter sandwich. That\'s it. No special energy gels needed.',
        wheresToBuy: 'Your kitchen',
      },
      {
        tier: 'invest',
        body: 'A second water bottle so you can refill one mid-ride without running dry. And maybe some sports drinks if you\'re riding hard or in hot weather.',
        wheresToBuy: 'Decathlon, Halfords, Amazon',
      },
      {
        tier: 'allout',
        body: 'Energy gels and electrolyte powders. These are for race-pace efforts only. For steady riding, real food works better and tastes less like plastic.',
        wheresToBuy: 'Specialist sports shops',
      },
    ],
  },

  {
    id: 'routes',
    title: 'Routes & where to ride',
    intro: 'Find the cycling around you.',
    tiers: [
      {
        tier: 'minimum',
        body: 'Komoot (free tier), the Strava global heatmap, and Google Maps cycling layer all show you where cyclists actually ride near you. Spend 10 minutes poking around — you\'ll find routes you didn\'t know existed.',
        wheresToBuy: 'Online',
      },
      {
        tier: 'invest',
        body: 'Local cycling clubs almost always run beginner rides. Search "[your town] cycling club" or look on local Facebook groups. You\'ll meet other riders and learn how to navigate routes you\'ve only seen on maps.',
        wheresToBuy: 'Facebook, local bike shops',
      },
      {
        tier: 'allout',
        body: 'Build your own routes from .gpx files. UK riders can use Sustrans for traffic-free routes. US riders can explore Adventure Cycling routes. Once you know the basics, custom routes let you chain together your favourite pieces.',
        wheresToBuy: 'Sustrans.org.uk, Adventurecycling.org',
      },
    ],
  },

  {
    id: 'community',
    title: 'Community & confidence',
    intro: 'Showing up is the hardest part.',
    tiers: [
      {
        tier: 'minimum',
        body: 'You don\'t have to look like a cyclist to be a cyclist. You don\'t need a matching kit or a £5k bike. The pace doesn\'t matter. Showing up — that\'s what makes you a cyclist. Every ride counts, even the slow, short ones.',
        wheresToBuy: 'Already inside you',
      },
      {
        tier: 'invest',
        body: 'Join a local club ride. Most clubs have a beginner group that rides at a conversational pace. That first ride feels scary until you realise everyone started somewhere. After your first group ride, everything else feels easier.',
        wheresToBuy: 'Local cycling clubs',
      },
      {
        tier: 'allout',
        body: 'Sign up for a sportive 12 weeks into your training. A structured event and a finish line turn training from abstract into concrete. You\'ll surprise yourself with what you can do.',
        wheresToBuy: 'Local cycling event websites',
      },
    ],
  },
];
