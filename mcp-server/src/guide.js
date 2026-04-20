/**
 * Cycling beginner guidance — curated, generic advice for riders starting out.
 * Returned by the `cycling_beginner_guide` MCP tool.
 *
 * Source: distilled from the Etapa blog (https://getetapa.com/blog) and
 * established beginner-cycling guidance. Plain English. No jargon.
 *
 * This is generic content — it does NOT require an Etapa account or API call.
 */

export const GUIDE_TOPICS = {
  getting_started: {
    title: 'How to start cycling as a complete beginner',
    content: `You don't need to be fit, young, or own fancy kit to start cycling. You just need a working bike, somewhere safe to ride it, and the willingness to feel a bit wobbly for the first few sessions.

The single biggest thing most beginners get wrong is trying to do too much too soon. A 15-minute loop around the park three times a week beats an ambitious 2-hour ride that leaves you sore and discouraged. Consistency over distance, always.

Your first three rides should focus on one thing only: getting comfortable on the bike. Don't worry about speed, heart rate, or distance. Practise starting, stopping, looking over your shoulder, and signalling with one hand. Every hour spent building confidence in a quiet car park is worth ten on a busy road.

Once you can ride for 20 minutes without feeling out of control, start building gently. A good rule for the first month: ride as often as you can at a pace where you can still hold a conversation. That's it. The fitness will come.`,
    keyPoints: [
      'Start with 15-20 minute rides, 2-3 times a week',
      'Prioritise comfort and bike-handling confidence over speed',
      'Conversational pace — if you can\'t chat, you\'re going too hard',
      'Consistency beats intensity, especially in month one',
      'A quiet car park is an excellent first "route"',
    ],
  },

  first_bike: {
    title: 'Choosing your first bike',
    content: `You don't need a £3,000 carbon road bike. The best first bike is the one that gets you out the door regularly — that usually means comfortable, easy to maintain, and within your budget.

For most beginners, a hybrid bike (roughly £300-600 new, less second-hand) is the smart choice. It has an upright riding position that's easier on your back and neck, wider tyres that handle potholes and gravel, and enough gears for hills without being overwhelming. Brands like Giant, Trek, Specialized, and Cube all make solid hybrids.

If you know you want to ride fast on tarmac, a road bike makes sense — but start with an aluminium frame (not carbon), and look for "endurance geometry" which is more upright and forgiving.

If you're worried about hills or distance, an e-bike is a brilliant equaliser. They're heavier and pricier, but they turn a daunting 30km hilly ride into a pleasant one. No shame in it.

Second-hand is great for saving money — check Facebook Marketplace, Gumtree, or your local bike co-op. Get a mechanic to check it over before buying (most bike shops will do this for £20-30). Avoid very cheap supermarket bikes — they're heavy, hard to service, and will put you off cycling.`,
    keyPoints: [
      'A hybrid bike is the best first bike for most people',
      '£300-600 new, or £150-350 second-hand',
      'Avoid supermarket bikes — they\'re a false economy',
      'E-bikes are a legitimate choice, especially if you have hills or joint issues',
      'Get any second-hand bike checked by a mechanic before you commit',
    ],
  },

  essential_gear: {
    title: 'What gear you actually need to start',
    content: `You need less than the internet would have you believe. Here's the honest minimum:

Essential:
- A helmet (£30-60 is plenty). Replace after any crash, even if it looks fine.
- Front and rear lights (£15-30 for a set). The law requires them after dark, and even in daylight they make you dramatically more visible.
- A basic floor pump with a pressure gauge (£20-30). Under-inflated tyres are the #1 cause of punctures.
- Padded cycling shorts. The single biggest upgrade for comfort. £25-40 gets you a decent pair. Yes, you wear them with no underwear.

Nice to have (not urgent):
- Cycling glasses (£10-30). Protect your eyes from wind, sun, grit, and insects.
- Gloves with padding. Helpful on longer rides to prevent numb hands.
- A water bottle and cage (£15 combined). Essential once rides go over an hour.
- A saddlebag with a spare inner tube, tyre levers, and a multitool (£30 for everything). Means a puncture isn't a walk home.

You don't need:
- Lycra (wear whatever you're comfortable in)
- Cleats/clipless pedals (flat pedals are completely fine for years)
- A heart rate monitor, power meter, or Garmin
- Expensive shoes or a racing jersey

Your first £100 of kit should be: helmet, lights, padded shorts, pump. That's it.`,
    keyPoints: [
      'Helmet, lights, pump, and padded shorts = your essential first £100',
      'No need for Lycra, cleats, or a Garmin when starting out',
      'Replace your helmet after any impact',
      'Padded shorts are the best single comfort upgrade',
      'A saddlebag with spare tube + levers + multitool prevents a lot of ruined rides',
    ],
  },

  first_ride: {
    title: 'Your very first ride — a checklist',
    content: `Before you set off:
1. Pump your tyres. Most tyres have a recommended pressure printed on the sidewall (usually 40-80 psi). A firm tyre rolls better and punctures less.
2. Check your brakes. Squeeze both levers hard — the bike shouldn't move. If either feels spongy, get it looked at before you ride.
3. Check the chain has oil. If it squeaks or looks rusty, add a drop of bike chain lube to each link and wipe off the excess.
4. Tell someone where you're going and roughly when you'll be back.
5. Bring: phone, a bit of cash or a card, water, your helmet, and lights if there's any chance of being out after dusk.

On the ride:
- Start slow. Honestly slow. The first 10 minutes should feel gentle.
- Practise looking over your left shoulder without wobbling. Do this on every quiet bit of road.
- Signal every turn, even when there's no one around. Build the habit now.
- Use your gears. You should be pedalling at a comfortable cadence (roughly one pedal revolution per second). If your legs feel heavy, shift to an easier gear.
- Take breaks when you want to. Stopping doesn't mean you've failed.

Coming home:
- Don't stop abruptly — spin easily for the last 5 minutes to cool down.
- Drink water.
- Have a snack within 30 minutes if the ride was over an hour.

You'll feel wobbly, slightly unfit, and probably a bit silly. That's completely normal. Everyone felt like that on ride one.`,
    keyPoints: [
      'Check tyres, brakes, and chain before every first ride',
      'Tell someone where you\'re going',
      'Start at a conversational pace for the first 10 minutes',
      'Use your gears — your legs should feel spinny, not grindy',
      'Wobbling on your first ride is universal and fades quickly',
    ],
  },

  nutrition_and_hydration: {
    title: 'Eating and drinking on the bike',
    content: `For any ride under an hour: water is all you need. Don't overthink it.

For rides between 1-2 hours: bring a bottle of water, and a small snack (a banana, an energy bar, a flapjack, or a cereal bar). Eat the snack about 45-60 minutes in — before you start feeling tired. If you wait until you're hungry on the bike, you've left it too late.

For rides over 2 hours: you need ~30-60g of carbohydrate per hour. That's roughly a banana plus an energy gel, or two cereal bars, or a gel and a handful of jelly babies. Drink ~500ml of water per hour, more if it's hot. A small amount of salt (electrolyte tabs, £5-10 for a tube, or just a pinch in your bottle) helps on hot days.

Before the ride:
- Eat a light meal 1-2 hours before — porridge, toast, a banana and peanut butter. Nothing heavy or unfamiliar.
- Don't ride on a completely empty stomach for anything over 30 minutes.

After the ride:
- Have a proper meal within 1-2 hours — something with carbs and protein. Eggs on toast, pasta, a sandwich with cheese. Nothing fancy.
- Water first, then whatever drink you fancy.

The "bonk" — that sudden awful feeling of having no energy — is always avoidable with regular eating. Set a timer on your watch or phone for every 30 minutes as a reminder, at least until it becomes habit.`,
    keyPoints: [
      'Under 1 hour: just water',
      '1-2 hours: water + one snack',
      'Over 2 hours: 30-60g carbs per hour, ~500ml water per hour',
      'Eat before you feel hungry — by then it\'s too late',
      'A sensible meal with carbs + protein within 1-2 hours after is enough recovery nutrition',
    ],
  },

  safety: {
    title: 'Riding safely on the road',
    content: `Most new cyclists worry about traffic, and they're right to think about it — but with a few habits, riding in traffic becomes reasonable and even enjoyable.

Where to position yourself on the road:
- Ride about a metre out from the kerb — closer and you hit drain covers, debris, and parked car doors; further and you're in traffic. This is called the "primary" or "secondary" position in UK cycling guidance.
- On narrow roads, take the centre of the lane. This prevents drivers from squeezing past. It looks assertive but it's far safer.
- Never ride in a driver's blind spot. If you can't see their mirrors, they can't see you.

Looking and signalling:
- Look over your shoulder before EVERY manoeuvre — turning, changing lane, pulling out from a parked car. Even on empty roads. Make it automatic.
- Signal clearly and early. Hold your arm out for at least 3 seconds before turning.
- Make eye contact with drivers at junctions when you can. Assume they haven't seen you until you know they have.

Specific danger points:
- Left-turning lorries and buses. Never come up the inside of a large vehicle at a junction. Just don't. Wait behind them.
- Parked cars — ride far enough out to be clear of car doors opening ("the door zone").
- Pedestrians stepping out looking at phones — slow down near bus stops, shop entrances, and school crossings.

Night riding:
- Legally in the UK you need a white front light and red rear light from sunset to sunrise, plus a red rear reflector and amber pedal reflectors.
- In practice, use lights in the daytime too — you're 40% more visible.
- Reflective strips on your ankles move, which catches drivers' eyes.

Finally: if a road genuinely feels too scary, it's fine to get off and walk the pavement, or to take a different route. You never have to prove anything.`,
    keyPoints: [
      'Ride ~1m out from the kerb, take the lane on narrow roads',
      'Look over your shoulder before every manoeuvre — make it automatic',
      'Never ride up the inside of a lorry or bus at a junction',
      'Watch out for parked-car "door zones"',
      'Lights on in daytime make you dramatically more visible',
    ],
  },

  building_a_habit: {
    title: 'Making cycling stick',
    content: `The hardest part of cycling isn't fitness — it's still being a cyclist in six months. Most beginners ride enthusiastically for 3-4 weeks and then drift away. A few simple tricks dramatically increase the odds of sticking with it.

1. Fix a specific time, not an amount. "Tuesday evening 6pm" is a plan. "I'll ride more this week" isn't. Treat it like a meeting.

2. Lower the bar. On days when you don't feel like riding, tell yourself you'll just go for 10 minutes. Nine times out of ten you'll carry on once you're moving. The tenth time, a 10-minute ride still beats zero.

3. Find one route you love. Most riders have a "home loop" — 30-60 minutes, starts and ends at their door, has a coffee stop or a nice view. Having a reliable fallback route means you don't have to make a decision every time.

4. Ride with someone, some of the time. Even one social ride a fortnight doubles your chances of sticking with it. Beginner groups (British Cycling's Breeze rides for women, Let's Ride for everyone, local cycling clubs' intro rides) exist specifically for this.

5. Track something — but not everything. An app (Strava, Komoot, Etapa, or just your phone's health app) that logs your rides creates a visible record of progress. Don't obsess over pace or heart rate. Just notice: I rode three times this week. Six weeks ago I rode once.

6. Plan for bad weather. Decide in advance: "if it's raining, I'll do 20 minutes on the indoor trainer" or "I'll just walk the dog and ride tomorrow instead." Vague weather plans mean you skip the ride.

7. Celebrate small wins. Your first 20km ride, your first ride in the rain, your first time making it up that hill without stopping. These matter. Tell someone.

And don't beat yourself up for missed rides. Everyone has off weeks. The riders who stay cyclists are the ones who start again on Monday, not the ones who never missed a session.`,
    keyPoints: [
      'Schedule specific times, not vague intentions',
      'The "just 10 minutes" rule gets you out on low-motivation days',
      'One regular home loop removes decision fatigue',
      'Ride with others, even occasionally — it sharply improves retention',
      'Track rides for visible progress, but don\'t obsess over pace',
    ],
  },

  bike_fit: {
    title: 'Getting your bike set up right',
    content: `A badly fitted bike will give you sore knees, a sore back, numb hands, and a sore bum — and it'll make every ride a chore. Good news: 90% of fit problems come down to saddle height, and you can sort it in 10 minutes.

Saddle height:
- Sit on the bike (against a wall or with a helper). Put your heel on the pedal at its lowest point (6 o'clock). Your leg should be fully straight. When you ride normally with the ball of your foot on the pedal, you'll then have a very slight bend at the knee — about 25-30 degrees.
- If your saddle is too low (very common in new riders), your knees will hurt at the front.
- If it's too high, your hips rock side to side as you pedal and you'll get pain at the back of the knee.

Saddle fore/aft:
- With the pedals level (3 and 9 o'clock) and sitting normally, a plumb line dropped from just below your kneecap should pass roughly through the pedal axle. Most beginners don't need to touch this.

Handlebar height:
- For new riders, handlebars should be level with or slightly above the saddle. A bike shop can add or remove spacers under the stem to adjust this in 5 minutes.
- Low, aggressive drops might look pro but they cause neck and lower back pain on longer rides.

Saddle comfort:
- The saddle that came with your bike might not suit you. If you have persistent soft-tissue pain after a few rides in padded shorts, try a different saddle. Many shops do saddle trials. This is not a minor issue — it's the #1 reason people stop cycling.
- Women-specific saddles exist for a reason. If you're a woman and the stock saddle hurts, try one.

If you've sorted these three things (saddle height, handlebar height, saddle choice) and still have persistent pain after 3-4 rides, book a professional bike fit at a local shop (£50-150). For most beginners it's overkill; for persistent pain it's the best cycling money you'll ever spend.`,
    keyPoints: [
      'Saddle height is the single most important setting — start with heel-on-pedal-straight-leg',
      'Low saddle = knee pain (front); high saddle = knee pain (back) and hip rocking',
      'Handlebars should be level with or slightly above the saddle for beginners',
      'Saddle discomfort that doesn\'t improve = wrong saddle, not "toughen up"',
      'A £50-150 professional bike fit is worth it if pain persists',
    ],
  },

  common_mistakes: {
    title: 'The 5 most common beginner mistakes',
    content: `1. Starting too hard, too often.
Nearly every new cyclist goes flat-out because they feel they "should" be working hard. Then they're exhausted, sore, and don't want to ride again for a week. 80% of your riding should feel easy — you can comfortably hold a conversation. Only 20% should feel hard. Every week. Forever.

2. Ignoring tyre pressure.
Under-inflated tyres are slow, uncomfortable, and puncture easily. Check your pressure before every ride or at least weekly. Your floor pump has a gauge — use it. For most hybrid bikes, 40-60 psi is a good start; road bikes 70-95 psi; mountain bikes 25-40 psi.

3. Riding in the wrong gear.
Most beginners grind along in too high a gear, pushing hard slowly. You want to spin — around 80-90 pedal revolutions per minute, or roughly one pedal stroke per second. If your legs feel heavy, shift to an easier gear. Protect your knees.

4. Forgetting to eat and drink.
Bonking (suddenly running out of energy) always feels dramatic but is always avoidable. Set a 30-minute timer on your watch or phone. Sip water every time it goes off, eat a bite every second time if the ride is over an hour. Problem solved.

5. Comparing yourself to Strava averages or other cyclists.
Strava segments are full of people who are lighter, younger, have more time to train, better bikes, favourable weather, and who've ridden that exact segment 400 times. Comparing your first month to their tenth year is demotivating and meaningless. Compare yourself only to yourself 6 weeks ago.`,
    keyPoints: [
      '80/20 rule: 80% easy, 20% hard',
      'Check tyre pressure before every ride',
      'Spin, don\'t grind — aim for ~80-90 rpm cadence',
      'Eat and drink on a timer, not on feel',
      'Only compare yourself to past-you',
    ],
  },
};

/**
 * Returns a list of topic slugs + titles — used when the MCP tool is called
 * without a specific topic.
 */
export function listTopics() {
  return Object.entries(GUIDE_TOPICS).map(([slug, t]) => ({
    slug,
    title: t.title,
  }));
}

/**
 * Returns a formatted markdown string for a single topic, or a topic index
 * if no topic is specified.
 */
export function getTopic(slug) {
  if (!slug) {
    const lines = [
      '# Etapa Cycling Beginner Guide',
      '',
      'Pick any topic below by name — e.g. "getting_started", "first_bike", "essential_gear".',
      '',
      ...listTopics().map((t) => `- **${t.slug}** — ${t.title}`),
      '',
      '_Guidance distilled from the Etapa blog (https://getetapa.com/blog). For a personalised training plan tailored to your fitness, goal, and schedule, use the `generate_training_plan` tool (powered by the Etapa API) or download the Etapa app at https://getetapa.com._',
    ];
    return lines.join('\n');
  }

  const topic = GUIDE_TOPICS[slug];
  if (!topic) {
    const valid = Object.keys(GUIDE_TOPICS).join(', ');
    return `Unknown topic "${slug}". Valid topics: ${valid}`;
  }

  return [
    `# ${topic.title}`,
    '',
    topic.content,
    '',
    '## Key points',
    ...topic.keyPoints.map((p) => `- ${p}`),
    '',
    '---',
    '',
    '_Generic guidance from the Etapa Cycling Beginner Guide. For a personalised training plan, call `generate_training_plan` (uses the Etapa API) or download Etapa at https://getetapa.com._',
  ].join('\n');
}
