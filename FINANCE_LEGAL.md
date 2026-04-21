# Etapa — Finance + Legal

Single source of truth for how Etapa's finances and legal posture are set up. Two parts:

1. **Broad advice** — prose, copy into Notion as a regular page.
2. **Action list (Notion import)** — CSV block, save as `.csv` and import into your Finance + Legal database.

Not regulated advice. Pair the broad advice with a two-hour session from a startup-literate UK accountant, and the legal items with a £1.5–3k solicitor engagement.

---

## Part 1 — Broad advice

### Separate the company from yourself, immediately

Incorporate a UK Ltd at Companies House (£12, 20 minutes) before another line of code ships. Tide is already set up — keep it ring-fenced to the Ltd only. From day one, every pound that touches Etapa goes through the company card. Commingling is how founders end up unable to tell whether they're profitable, unable to sell the company cleanly, and on the wrong end of an HMRC inquiry. If personal money has already gone in, log it as a **director's loan** and recover it tax-free later.

The Ltd also gives you a legal wall. You store user data, process payments through Apple, and use an LLM that will occasionally say something stupid. You don't want to be personally sued because your AI coach told someone to ride through a hill climb and they snapped an ankle.

### Ring-fence personal runway before committing another penny

Work out your honest monthly personal costs. Six months of that sits in a separate savings account, ideally at a different bank, and you do not touch it for the business, ever. Solo founders who cannibalise this fund to extend Anthropic credits are the ones who quit within eighteen months — not because the product failed, but because the stress of being one unexpected bill from catastrophe broke them.

Decide the numbers, in writing, while you're calm. The MRR at which you quit any day job. The MRR at which you hire. The maximum loss you'll accept before shutting it down. The maximum months you'll stay unpaid. Write them down. Don't move them.

### The revenue math is worse than it looks

When your first £7.99 subscription lands, Apple takes 30% — or 15% if you apply to the Small Business Program (do it the day after incorporation). What's left arrives in Tide 30–45 days after the month ends. Corporation tax is 19% below £50k profit, tapering to 25% above £250k. VAT registration is mandatory at £90k rolling 12-month turnover.

Practical consequence: if you hit £1,000 MRR, mentally spend around £550. Build your burn model on the post-deductions number and keep a running 12-month cash flow spreadsheet. You should be able to tell anyone, at any moment, how many months of runway you have. If you can't, you're flying blind.

### Pay yourself something, even tiny

Founders who take zero salary for two years burn out spectacularly. Resentment compounds. Once the company has any revenue, pay yourself a small director's salary (around £1,000/month uses your personal allowance tax-efficiently and builds state pension credits). Above that, take dividends. Your accountant sets the optimal split each tax year. Psychologically, this reframes the relationship: the company owes you, rather than you owing the company.

### Get an accountant, not a bookkeeper

FreeAgent (free via Mettle) or Xero (~£15/month) handles bookkeeping and VAT. Hire a human accountant separately for year-end accounts, corporation tax, salary/dividend split, expensible items, R&D tax credits (your AI plan generation may qualify — meaningful rebate), SEIS/EIS readiness. Budget £600–£1,200/year. The tax savings from a good one cover the fee many times over, and you stop lying awake wondering if you're doing something wrong.

### Never personally guarantee anything

The fastest way to wreck a solo founder's life isn't the business failing — it's the business failing and leaving debt attached to your name. Never personally guarantee a business credit card. Never sign a commercial lease that survives the company. Never fund runway by maxing personal credit cards. I've watched founders do this; most of them carry the debt for a decade after the product dies.

### Plan for success as carefully as failure

Most founder advice obsesses over failure scenarios. But success without a plan leaves you with £40k in the account and no idea what to do. Decide the triggers now: at ~£2k MRR you start a 3-month operating buffer; at ~£5k MRR you quit the day job; at ~£10k MRR you pay a proper salary and take dividends; at ~£15k MRR you hire a customer support contractor (not a developer); at ~£25k MRR you review SEIS/EIS and R&D tax credits with the accountant.

### Legal posture — engage a solicitor before public launch

Three risks matter most: (1) Strava API compliance — your current beta forwarded ride data to Claude, which Strava's terms forbid; the server-side strip is in code but needs deployment and a solicitor's read on residual exposure; (2) medical advice — your AI coach talks about training load and injury, which needs an enforceable Assumption-of-Risk disclaimer and hardened system prompt; (3) DMCC Act 2024 subscription rules come into force autumn 2026 — pre-contract disclosure, 14-day cooling-off, easy cancellation parity, reminder notifications. Apple and Google handle some but not all.

Budget £1,500–£3,000 for a starter solicitor engagement: ToS, Privacy, EULA, Subscription Terms (DMCC-ready), health disclaimer, cookie notice, Acceptable Use Policy. Add £170 for a UK trademark filing, £52/yr ICO data protection fee, and £500–£1,500/yr for PI + Cyber + D&O insurance. Total realistic first-year legal spend: £2,500–£5,500. This is one of the most leveraged spends you'll make pre-launch.

### Insurance is cheap peace of mind

Professional Indemnity (target £1m cover) covers claims of negligent AI advice. Cyber Liability (£1m) covers data-breach response. Directors & Officers (£500k) covers personal exposure for claims against you as director. Try Hiscox, Markel, Simply Business. Compare against Tide's bundled cover — verify what's actually included vs excluded.

### Security hygiene is non-optional

One compromised Apple ID, Google Workspace, or Tide login ends the company. Turn on 2FA on every business account today — Apple Developer, Google Play, Tide, GitHub, Anthropic, Railway, Supabase, RevenueCat, Cloudflare/domain registrar, Sentry, PostHog. Use a password manager for business credentials (1Password Business or Bitwarden, separate vault from personal). Set auto-renewal on the domain — losing `getetapa.com` is near-extinction. And tell one trusted person where recovery keys live, in case you're hit by a bus.

### Emotional hygiene matters more than the spreadsheets

The founders who succeed financially aren't the ones who pinch every penny. They're the ones honest with themselves about what they can afford to lose, set that ceiling up front, and stop worrying about it. Write the number down. Tell a partner or trusted friend what it is. Then spend the money you've allocated without guilt, and not a penny more. If you're cagey about the number because you're afraid to look at it, you'll make bad decisions every month out of low-grade dread.

### The rhythms that keep this all working

**Monthly (30 min, same day every month):** open Tide → cancel one subscription; check Anthropic/Railway/Supabase usage vs caps; update cash flow projection; put ~20% of profit into the corporation tax pot.

**Quarterly (2 hours):** review MRR vs trigger numbers; top up personal emergency fund if drawn; check VAT turnover; re-check Strava/Anthropic/App Store terms for drift.

**Annually:** meet accountant before year-end for salary/dividend planning; file Companies House confirmation statement (£34); renew ICO (£40–60) + Apple Developer (£79); re-quote insurance.

### Permanent rules

1. No personal guarantees on any business credit.
2. No funding runway via personal credit cards.
3. No commingling of personal and business money.
4. No raiding the personal emergency fund.

---

## Part 2 — Action list (import into Notion)

Copy the CSV below, save it as `finance-legal.csv`, then in Notion open your Finance + Legal database → `···` menu → **Merge with CSV** → select the file. Columns match the existing schema exactly.

**Columns:** `Title, Tag, Description, Priority, Status`

**Tags:** Structural / Personal / Legal / Security / Governance / Rule / Recurring / Trigger

**Priority:** P0 (do now, blocks other work) · P1 (within a month) · P2 (before public launch, or recurring) · P3 (only when the trigger hits)

**Status:** Now (can start today) · Next (blocked, or scheduled later)

```csv
Title,Tag,Description,Priority,Status
Incorporate UK Ltd at Companies House,Structural,"£12, 20 min. Pick director (you), SIC code 62012, home or registered-office address. Blocks basically everything else.",P0,Now
Register SIC code 62012 at Companies House incorporation,Structural,"""Business and domestic software development"". Tells HMRC and future investors what the company does. Takes 10 seconds on the formation form.",P0,Now
Confirm Tide account is under the Ltd not sole trader,Structural,"If currently personal/sole-trader, open a new Tide Ltd account and migrate.",P0,Now
Confirm HMRC Corporation Tax activation received post-incorporation,Structural,"Usually auto-triggered 2–3 weeks after incorporation. Chase HMRC if the UTR + activation letter doesn't arrive.",P0,Now
Set up HMRC Government Gateway account for the company,Structural,"Separate from your personal Gateway. Needed to file Corporation Tax, VAT, and PAYE online.",P0,Now
Apply to Apple Small Business Program,Structural,"Drops Apple's cut from 30% to 15% on first $1M revenue. Free, 10 min. Do the day after incorporation.",P0,Now
Pay the ICO data protection fee,Legal,"£52/yr. Register at ico.org.uk/register. Legally required because Etapa stores user data. Calendar a renewal for 12 months out.",P0,Now
Set hard monthly spend cap on Anthropic API,Structural,"£100–200 pre-launch. Set in console.anthropic.com under billing.",P0,Now
Move every SaaS onto company Tide card,Structural,"Railway, Supabase, Anthropic, RevenueCat, Sentry, PostHog, domain, Apple Developer, Google Play. No business spend on personal cards from today.",P0,Now
Enable 2FA on every business account,Security,"Apple Developer, Google Play, Tide, GitHub, Anthropic, Railway, Supabase, RevenueCat, Cloudflare/domain registrar, Sentry, PostHog, Vercel. One compromised account can end the company.",P0,Now
Set domain to auto-renew and credit card on file,Security,Losing the getetapa.com domain is a near-extinction event. Cheap to prevent.,P0,Now
Book a 2-hour session with a startup-literate accountant,Structural,"Budget £150–250. Ask about: director's salary/dividend split, R&D tax credits for AI plan generation, SEIS/EIS readiness, VAT timing.",P0,Now
Ring-fence 6 months of personal living costs,Personal,"Separate savings account, ideally at a different bank. Do not touch for the business, ever. Oxygen mask.",P0,Now
Log every pound already spent personally as a director's loan,Personal,"Total from bank statements, record in a sheet, tell the accountant. Recoverable tax-free when the company can afford it.",P0,Now
Decide and document max acceptable personal loss (£ + months),Personal,"The hardest but most important number. Write it down: how much you're prepared to lose and how many months you'll stay unpaid. Lives in your head otherwise and corrodes decisions.",P0,Now
Audit personal guarantees on all Etapa contracts,Legal,"For each: what for → signed as personal or Etapa Ltd → PG yes/no → notes. Check Tide opening, Apple Dev, Google Play, hosting.",P0,Now
Move Apple & Google developer accounts to company ownership,Legal,"If currently tied to personal Apple ID / Google account. Apple ""Organization"" account type.",P0,Now
Personal asset protection: separate personal vs Etapa Ltd bank accounts,Personal,Never pay personal expenses from Tide.,P0,Now
Personal asset protection: ensure Etapa IP owned by Etapa Ltd,Personal,"Trademark, domain getetapa.com, GitHub org, etc. Transfer anything held personally.",P0,Now
Redeploy server so Strava-stripping + medical guardrails are live in prod,Legal,Ensure current production deploy includes latest mitigation changes.,P0,Now
Permanent rule: no personal guarantees on any business credit,Rule,"Never. Not a credit card, not a lease, not a loan. This is how founders end up bankrupt after the company fails.",P0,Now
Permanent rule: no funding runway via personal credit cards,Rule,Most corrosive thing you can do. Founders carry the debt for a decade after the product dies.,P0,Now
Permanent rule: no raiding the personal emergency fund,Rule,"Six months of living costs, untouchable. If you hit it, the plan is wrong.",P0,Now
Opt in to Companies House Protect Your Information service,Structural,£19.99/yr. Keeps your home address off the public director register. Prevents spam and protects against physical harassment.,P1,Now
Use a registered office service instead of home address,Structural,"£30–60/yr. 1st Formations, Hoxton Mix, or similar. Privacy, and flexibility if you move.",P1,Now
Write down trigger numbers,Personal,"Quit-day-job MRR: £___, first-hire MRR: £___, max acceptable personal loss: £___, max months unpaid: ___.",P1,Now
Set up FreeAgent or Xero + connect Tide feed,Structural,"FreeAgent free via Mettle or ~£19/mo; Xero ~£15/mo. Auto bank feeds save a week at year-end.",P1,Now
Build a 12-month cash flow spreadsheet,Structural,"Columns: month. Rows: revenue, Apple cut, Anthropic, Railway, Supabase, Apple Dev, ICO, accountant, your salary, corp tax provision, running balance.",P1,Now
Confirm app company metadata is under the Ltd,Structural,"App Store Connect legal entity, Google Play Console, RevenueCat org, domain registrar. Transfer anything still on personal IDs.",P1,Now
Put a 30-min monthly finance day recurring event in the calendar,Structural,"Same day every month. Cancel one subscription, check usage, update cash flow, reconcile books.",P1,Now
Use a password manager for all business credentials,Security,1Password Business or Bitwarden. Separate vault from personal. Enables sharing later if you hire.,P1,Now
Cloud-backup all contracts and company documents,Security,"Separate from laptop. Google Drive / Dropbox folder with articles of association, incorporation cert, contracts, IP assignments, tax correspondence.",P1,Now
Tell one trusted person where recovery keys and passwords live,Security,"Bus-factor mitigation. If hit by a bus, can someone recover your Apple ID, Tide access, domain, GitHub org?",P1,Now
Read the 7 Companies Act directors' duties (s.172),Governance,"20 min read, free. GOV.UK has a plain-English summary. Non-negotiable to understand what you're signing up for as a director.",P1,Now
Trademark clearance search for Etapa (UK IPO / EUIPO / USPTO),Legal,Check classes 9 / 41 / 42 for conflicts.,P1,Now
Get insurance quotes: PI Cyber D&O,Legal,"Try Hiscox, Markel, Simply Business. Compare to Tide bundled cover.",P1,Now
Create company decision log,Legal,"Separate doc: running record of material decisions, contracts signed, resolutions.",P1,Now
Test Apple sandbox purchase → real payout end-to-end,Structural,Confirm funds land in Tide and verify 30–45 day payout timing post-month-end.,P1,Next
Decide director's salary from launch day or defer 3 months,Personal,Small salary (~£1k/mo) is tax-efficient from day one. Ask the accountant.,P1,Next
Register for PAYE with HMRC,Structural,Required before paying yourself any salary. Accountant can do it in 15 min.,P1,Next
Open a separate savings account for the corporation tax provision,Structural,Allica or Atom Business. Earns real interest on money that's owed to HMRC anyway.,P1,Next
Consider Professional Indemnity Insurance,Legal,"£250–500/yr for £1m cover. Hiscox or Superscript. Critical — covers claims of negligent AI advice.",P1,Next
Consider Cyber Liability Insurance,Legal,Target £1m cover. Covers data-breach response costs.,P1,Next
Document a one-page refund and chargeback policy before launch,Legal,"Publish on website + in-app. Decide internal process: who responds, refund authority, escalation triggers. Missing this is a DMCC risk and a customer-trust hit.",P1,Next
Document a one-page GDPR subject access request (SAR) process,Legal,"How you respond within 30 days when a user asks what data do you have on me. Template response, query to Supabase. Cheap now, nightmare under pressure.",P1,Next
[SOLICITOR] Engage tech/consumer/data-protection solicitor,Legal,Budget £1.5k–£3k starter engagement. Share LEGAL_AUDIT.md.,P0,Next
[SOLICITOR] Commission ToS/Privacy/EULA/Subscription/Disclaimer package,Legal,"ToS, Privacy, EULA, Subscription Terms (DMCC-ready), Assumption-of-Risk/Health Disclaimer, Cookie notice, AUP.",P0,Next
[SOLICITOR] Decide Children's Code strategy (adult-only vs compliant U18),Legal,"Choose: adult-only terms + DOB gate, or a compliant under-18 experience.",P0,Next
[SOLICITOR] Confirm international transfer mechanism for US sub-processors,Legal,Confirm UK-US Data Bridge vs UK IDTA vs SCCs.,P0,Next
[SOLICITOR] Clarify exposure from past Strava-derived AI context (beta),Legal,Assess whether prior beta usage creates any claim exposure.,P0,Next
[SOLICITOR] Final sign-off on ToS / Privacy / EULA / Subscription Terms,Legal,Complete before public launch.,P0,Next
File UK trademark for Etapa after clearance,Legal,"~£170 for 1 class, £50 per additional.",P1,Next
Decide Strava feature strategy (A on-device only / B partner programme / C switch providers),Legal,"Pick path; document decision. If B, start Strava partnership conversation now.",P0,Next
DMCC-readiness check for subscription flow,Legal,"Pre-contract price disclosure, explicit cooling-off, easy cancellation parity, reminder notifications.",P0,Next
Set up trial-end + renewal reminder emails,Legal,MailerLite or transactional mail. Send 3 days before trial→paid and before annual renewal.,P1,Next
Implement tick-box health consent before first plan generation,Legal,"Block Generate until acknowledged; persist in AsyncStorage.",P0,Next
Implement age gate at signup (DOB),Legal,Reject under-18 (or route to U18 experience depending on Children's Code strategy).,P0,Next
Add AI-generated content disclosure to App Store & Play Store listings,Legal,Required under Apple's new AI disclosure rules.,P1,Next
Publish sub-processors table on Privacy Policy,Legal,"Include Supabase, Railway, PostHog, Sentry, Anthropic, RevenueCat, MailerLite, Apple, Google, Strava. Add purpose/jurisdiction/DPA link.",P0,Next
Implement cookie banner/notice on getetapa.com (PECR),Legal,Functional-only: notice. Analytics: consent banner.,P1,Next
Create contact + complaints page (CMA guidance),Legal,Ensure fair-treatment complaints handling guidance is met.,P1,Next
Confirm Tide bundled insurance cover details,Legal,Verify what's actually included vs exclusions/limits.,P1,Next
Insurance: Directors & Officers (target £500k cover),Legal,Covers personal exposure for claims against you as director.,P2,Next
Insurance: assess need for Product Liability cover,Legal,Potentially relevant for injury-from-the-app claims.,P2,Next
Insurance: annual re-quote + coverage review,Legal,Re-quote each anniversary; grow cover as user base grows.,P3,Next
Personal asset protection: create simple will covering Etapa shares,Personal,~£100–300 at UK solicitor.,P2,Next
Research R&D tax credit eligibility for AI plan generation,Structural,The LLM-powered plan generation may qualify. Potentially meaningful rebate. Flag to accountant at first meeting.,P2,Next
Set up dividend voucher and board minutes templates,Structural,Required documentation for every dividend. Accountant provides templates — store somewhere findable.,P2,Next
Decide home office expense method,Structural,"HMRC flat rate (~£26/month, no receipts) vs actual cost. Flat rate is fine for a solo founder in a flat.",P2,Next
Keep an equipment asset register,Structural,"List of anything bought through the company: laptop, phone, monitor, desk. Matters at year-end for capital allowances.",P2,Next
Start a decision journal for material decisions,Governance,"One-line entry per decision over £1k spend, contract signed, or major product call. Date + decision + reason.",P2,Next
Marketing claims evidence file,Legal,"For every public claim (AI-powered coach, X% improvement), keep one-paragraph substantiation with sources. ASA complaints are cheap to lose without one.",P2,Next
Accessibility audit (target WCAG AA) before public launch,Legal,"Run through Stark or axe DevTools. Fix colour contrast, screen reader labels, tap targets. Required-ish under Equality Act 2010.",P2,Next
One-page business continuity plan,Governance,"What happens if: laptop dies, Railway goes down, you're hospitalised, Anthropic cuts off service. Fits on a single page.",P2,Next
Benchmark a reasonable director salary before paying yourself,Personal,"Solo founder £10k–£20k/yr salary + dividends is typical. Don't pay £5k salary + £95k dividends — HMRC reclassifies.",P2,Next
[SOLICITOR] (Optional) Consider shareholder agreement (even sole shareholder),Legal,Useful when adding co-founder/advisor/investor.,P3,Next
Monthly: Cancel one unnecessary subscription,Recurring,"30-min ritual, same day every month. Tide statement review.",P2,Next
Monthly: Check Anthropic/Railway/Supabase usage vs caps,Recurring,Part of the monthly finance day ritual.,P2,Next
Monthly: Update cash flow projection,Recurring,Part of the monthly finance day ritual.,P2,Next
Monthly: Put ~20% of profit into a separate corporation tax pot,Recurring,Into the dedicated savings account. Never forget it's HMRC's money not yours.,P2,Next
Quarterly: Review MRR vs trigger numbers,Recurring,Do any actions unlock? (3-month buffer / quit day job / first hire.),P2,Next
Quarterly: Top up personal emergency fund if drawn,Recurring,Re-verify 6 months of costs are still ring-fenced.,P2,Next
Quarterly: Check VAT turnover,Recurring,Register within 30 days of crossing £90k rolling 12-month turnover.,P2,Next
Quarterly: Re-check Strava API terms Anthropic T&Cs App Store/Play guidelines,Recurring,Watch for drift/changes.,P2,Next
Annually: Renew ICO + Apple Developer,Recurring,"ICO £40–60, Apple Developer £79. Calendar both.",P2,Next
Annually: File Companies House confirmation statement,Recurring,£34. File confirmation statement + micro-entity accounts.,P2,Next
Annually: Meet accountant pre-year-end,Recurring,Plan salary/dividend split for new tax year.,P2,Next
After material data-handling change: update Privacy Policy + sub-processors + DPA log,Recurring,,P1,Next
After prompt/plan changes: re-run adversarial medical prompts + log test date,Recurring,Verify guardrails hold.,P1,Next
Per incident: assess within 72h if ICO breach notification required,Recurring,Document decision even if not notifying.,P0,Next
After revenue starts: monitor VAT threshold,Recurring,Register within 30 days of crossing £90k (rolling 12m).,P1,Next
Before marketing spend in new country: check local consumer + data law,Recurring,EU: cookie consent. US: state-by-state.,P2,Next
£2k MRR trigger: open dedicated business savings account,Trigger,Start a 3-month operating buffer. Allica or Atom.,P3,Next
£5k MRR × 3 months trigger: quit day job + first director's salary,Trigger,"If still employed. Take first small director's salary (~£1k/mo).",P3,Next
£10k MRR trigger: proper salary + dividends + company pension contributions,Trigger,Pension contributions from the company are extraordinarily tax-efficient.,P3,Next
£15k MRR trigger: first hire (customer support contractor),Trigger,Not a developer. Contract template reviewed by lawyer first.,P3,Next
£15k MRR trigger: set up EMI option scheme before first hire,Trigger,HMRC-approved share option scheme. Huge tax win vs giving away actual shares.,P3,Next
£15k MRR trigger: consider key person insurance,Trigger,"Pays the company out if you're unable to work due to illness/injury. Optional, cheap, preserves runway.",P3,Next
£25k MRR trigger: accountant review on SEIS/EIS + R&D tax credits,Trigger,"Also review share structure — single class, future options planning.",P3,Next
```

---

## Superseded files — delete these

The following files were created during earlier iterations and are now covered by this single doc. Safe to delete:

```
git rm NOTION_FINANCE_LEGAL_SYNC.md
git rm notion-finance-additions.csv
git rm notion-finance-combined.csv
git rm etapa-finance-legal-notion.zip
git rm etapa-notion-import.zip
git rm LEGAL_TODO.md
```

Keep `LEGAL_AUDIT.md` — it's the deep-dive reference behind the `[SOLICITOR]` items and isn't duplicated here.

*Last updated: April 2026 · Re-review quarterly.*
