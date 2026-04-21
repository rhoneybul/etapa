# Etapa — Legal & Risk Audit

Prepared for Etapa Ltd (sole director / founder), pre-revenue, UK-based.

> **This is not legal advice.** It is a risk review drafted to brief a qualified UK solicitor. Every item flagged as a material risk should be discussed with a solicitor who specialises in tech / consumer / data protection law before launch.

## Context summary

- **Company:** Etapa Ltd, UK-registered, banking with TIDE (general business insurance in place).
- **Product:** React Native mobile app (iOS + Android) — AI cycling coach. Generates training plans using Anthropic Claude, has a conversational coach, integrates with Strava, sells subscriptions via Apple/Google through RevenueCat.
- **Stage:** Pre-revenue, closed beta.
- **Audience target:** UK + international; beginners, women, returning riders. Adults primarily but may attract under-18s.
- **Data flow:** Supabase (EU), Railway (US), PostHog (EU), Sentry, MailerLite, Anthropic (US), RevenueCat, Strava API.
- **Resourcing:** Solo founder, no employees.

## Executive risk summary

| # | Area | Current state | Severity | Urgency |
|---|---|---|---|---|
| 1 | **Strava API AI usage** | In breach: Strava data is passed into Claude context for coach chat & plan gen | **CRITICAL** | Immediate |
| 2 | ICO data protection fee | Unknown if registered | High | This week |
| 3 | UK DMCC Act subscription rules | Subscription flow may not meet autumn-2026 rules | High | Before launch |
| 4 | Health / injury disclaimers & waiver | No clear waiver seen in app or ToS | High | Before launch |
| 5 | Privacy Policy / ToS / EULA | Exists but not audited for current laws | High | Before launch |
| 6 | AI-generated advice liability | No explicit disclaimer of AI limitations | High | Before launch |
| 7 | Children's data (Under-18 likely users) | No age gate; ICO Children's Code likely applies | High | Before launch |
| 8 | International data transfers (US services) | No explicit SCCs/UK IDTA | Medium-high | Before scaling |
| 9 | Trademark "Etapa" | Unknown if registered | Medium | Before launch |
| 10 | Insurance adequacy | General TIDE policy — unlikely to cover AI/cyber/product claims | Medium-high | This month |
| 11 | PECR / email marketing | MailerLite wired; compliance not verified | Medium | Before first bulk send |
| 12 | VAT threshold & international sales | Pre-threshold now but app store sales cross borders | Medium | Before revenue |
| 13 | Personal guarantees on contracts | Unknown (TIDE? App Store agreement?) | Medium | Document now |
| 14 | Directors duties (Companies Act 2006) | Fine in principle, no formalised records yet | Low-medium | Ongoing |

## Detailed findings

### 1. CRITICAL — Strava's updated API Agreement prohibits AI use

Strava updated their API Agreement in late 2024 to **explicitly prohibit third parties from using any data obtained via Strava's API in artificial intelligence models or similar applications.** This is enforced with audit rights. They have openly used this to deprecate integrations ([DCRainmaker summary](https://www.dcrainmaker.com/2024/11/stravas-changes-to-kill-off-apps.html)).

**Current Etapa behaviour that conflicts:** the coach-chat endpoint (`server/src/routes/ai.js` — `/coach-chat`) builds a context object that includes `stravaActivities` and `weekComparisons` derived from Strava rides, then sends that context into Claude. The async plan generator also receives Strava context via `/generate-plan-async`. This is squarely inside the prohibition.

**Likely consequences:**
- App store removal if Strava requests it.
- Loss of Strava API access (which kills a marquee feature).
- In the worst case, contract claim from Strava if they consider your use commercially harmful.

**Options:**
1. **Strip Strava data from any Claude call.** Use Strava only for local display + plan comparison, never pass it into the LLM. Quickest safe path.
2. **Apply for a Strava partnership / carve-out.** Strava has commercial partner programmes — some AI use may be permitted with a signed deal. Slow but preserves the feature.
3. **Replace with an alternative integration** (Apple HealthKit, Garmin Connect, Google Fit) whose terms allow AI use. HealthKit is the most permissive; Garmin has a formal API programme.

**Action:** this is the first thing to resolve. Treat it as a P0 bug.

### 2. ICO data protection fee

The Information Commissioner's Office requires most UK organisations that process personal data to pay an annual Data Protection Fee — currently **£52/year for micro organisations** (under £632k turnover, fewer than 10 staff), **£78** for small/medium. Penalty for non-registration: up to £4,000 on top of the fee owed.

Etapa processes personal data (names, emails, goals, training activity, chat logs, Strava data, payments, device IDs). Registration is almost certainly required.

**Action:** register at [ico.org.uk/register](https://ico.org.uk/for-organisations/data-protection-fee/register/). Put it on a calendar to renew annually.

### 3. UK DMCC Act 2024 — subscription contract rules (autumn 2026)

The Digital Markets, Competition and Consumers Act 2024 introduces new subscription contract rules, now scheduled to come into force **autumn 2026**. They apply to any UK-facing recurring subscription. Non-compliance is enforced by the CMA with fines up to **10% of global turnover**.

Key obligations that affect Etapa's current paywall flow:

- **Pre-contract information:** present price, renewal terms, cancellation method clearly *before* the user subscribes.
- **Cooling-off period:** 14 days initial, 14 days after each renewal payment.
- **Easy cancellation:** "as easy to exit as to join" — no phone-call or email-to-support gatekeeping.
- **Reminder notifications:** before free trials end, and at regular intervals for long-term subs, stating renewal date, amount, and how to cancel.
- **Free trial notifications:** mandatory reminder before any free or discounted trial ends.

**Etapa's current state:** free trial is offered via the paywall, subscriptions (Monthly, Annual) are handled through Apple/Google via RevenueCat. Apple and Google handle some of this (their own trial reminders, cancellation flows via system settings) — but reliance on the platform does not discharge Etapa's legal duty. You remain responsible for UK compliance.

**Action items:**
- Review the paywall copy with a solicitor against the DMCC requirements.
- Plan a reminder-email flow (via MailerLite or transactional email) that fires 3 days before trial-to-paid conversion and before annual renewals. Document this flow before autumn 2026.
- Update your Terms of Service to include the 14-day cooling-off explicitly.

### 4. Health & injury disclaimers — fitness app liability

Cycling involves real physical risk: injury from training, crashes, over-training, pre-existing medical conditions (cardiac, musculoskeletal) that an AI plan generator can't account for.

UK courts will enforce a well-drafted disclaimer / waiver if it's clearly presented and accepted — but the protection is conditional on (a) non-negligent conduct and (b) the user genuinely understanding the risk. Disclaimers cannot exclude liability for death or personal injury caused by negligence ([Unfair Contract Terms Act 1977, s.2(1)](https://www.legislation.gov.uk/ukpga/1977/50)).

**What Etapa needs:**

1. An explicit in-app health disclaimer at first plan generation: *"Etapa's plans are AI-generated educational guidance, not medical advice. Consult a doctor before starting any exercise programme, especially if you have a heart condition, are pregnant, have an injury, or are over 50."*
2. A visible pre-ride safety note (helmets, road rules, weather) baked into the onboarding.
3. Terms of Service that include an "Assumption of Risk" clause users agree to on first use.
4. Clear separation: Etapa is a coach-style guidance tool, not a medical device. If plans ever start prescribing heart-rate zones, cadence targets, or recovery protocols based on personal medical input, that moves closer to being a "medical device" under UK MHRA regulation — which is a much bigger compliance lift.

**Action:** commission a solicitor to draft a health disclaimer + assumption-of-risk clause specific to AI-generated cycling training plans. Add it to onboarding as a tick-box ("I've read and agree") and to the Terms of Service.

### 5. Terms of Service, Privacy Policy, EULA

You have `website/privacy.html` and `website/terms.html` visible in the repo. I haven't done a line-by-line audit but the likely gaps for a current, defensible set are:

- **EULA for the mobile app** — Apple actually requires one (their default is used if none is provided). Google Play similarly. A proper EULA limits what the app is licensed for, separates Etapa Ltd's IP, and sets dispute-resolution terms.
- **DMCC-compliant subscription terms** (see #3).
- **Assumption-of-risk / health disclaimer** (see #4).
- **AI content disclaimer** — that plans and coach responses are AI-generated, may be wrong, and are not professional advice. Include a "don't follow advice that contradicts your doctor" line.
- **Data processing — list of sub-processors.** UK GDPR Art. 28 requires users know who processes their data. Your list should include: Supabase, Railway, PostHog, Sentry, Anthropic, RevenueCat, MailerLite, Apple, Google, Strava.
- **International data transfers.** You rely on US-based services (Railway, Anthropic, possibly Sentry). Since the 2025 Data (Use and Access) Act and the post-adequacy transfer regime, transfers to the US typically need a UK International Data Transfer Addendum (UK IDTA) or reliance on the UK-US Data Bridge. Standard template clauses from each provider are usually sufficient but must be documented.
- **Acceptable Use Policy** — what users aren't allowed to do with the coach chat (no medical questions about other people, no attempts to extract system prompts, etc).
- **Complaints procedure** (helpful for CMA compliance).
- **Governing law + jurisdiction** (England & Wales).

**Action:** a specialist solicitor can turn your existing `privacy.html` / `terms.html` into something defensible for ~£1–2k of fixed-fee work. Worth it.

### 6. AI-generated advice — liability framework

UK has no AI-specific law yet. Any AI bill is expected second half of 2026 at the earliest. Current AI regulation is principles-based (5 cross-sectoral principles) enforced by existing regulators (ICO, CMA, MHRA).

Liability for AI-caused harm falls under existing law:

- **Consumer Protection Act 1987** — product liability if a defective AI output causes damage.
- **Tort of negligence** — if a reasonable cycling coach wouldn't have given the advice the AI gave.
- **UK GDPR Article 22** — solely automated decision-making with significant effect requires specific legal basis. Etapa's plan generation is arguably automated decision-making even if the user initiates it. The coach chat is more conversational and less clear-cut.

**What this means in practice:**

- A user who follows an Etapa-generated plan, overtrains, sustains an injury, and can show the plan was unsuitable for their stated fitness level could potentially sue for negligence. The disclaimer in #4 is your primary defence.
- A user who claims they got wrong advice ("AI told me to train through a knee injury") could make a consumer claim. Your coach system prompt should be hardened against medical questions and consistently route to "see a doctor" language.
- Log everything. The `claude_usage_log` table you now have is genuinely useful for this — you can reconstruct what the AI said when, and to whom.

**Action:** harden the coach system prompt's medical-guardrails section (already in `server/src/routes/ai.js`) to be more explicit: *"If the user reports pain, injury, cardiac symptoms, pregnancy, or significant medical history, do not give training advice. Direct them to a doctor."* Test adversarial prompts periodically.

### 7. UK Age Appropriate Design Code (Children's Code)

The ICO's Age Appropriate Design Code applies to any online service **"likely to be accessed by" under-18s**, even if not designed for them. A cycling app will almost certainly attract under-18s (teenage cyclists are a real user group).

Fifteen standards apply, notably:
- High privacy settings by default for any user you can't age-verify as adult.
- Minimum data collection.
- No "nudge" patterns that push children to weaken privacy.
- Clear plain-language privacy information suitable for children.

**Etapa's current state:** no age gate seen in the onboarding. Strava connection pulls in Strava's age check as a proxy but isn't reliable.

**Options:**

1. **Adult-only terms.** Add "you must be 18+ to use Etapa" to the ToS and a date-of-birth check at signup. Simplest. Doesn't make the Code *not* apply (likely-to-access test) but it reduces risk.
2. **Dual experience.** Offer a lightweight under-18 version with no coach chat, no open-text inputs, maximum privacy defaults. More work, broader audience.
3. **Age gate plus adult-only enforcement.** Ask DOB at signup, refuse signups under 18. Middle path.

**Action:** pick an approach with your solicitor. Document the decision. ICO has direct enforcement powers and has been fining non-compliant services.

### 8. International data transfers (US processors)

Several of Etapa's sub-processors are US-based or multi-region. Each one needs a legal transfer mechanism under UK GDPR. In practice for small businesses this means:

- **Anthropic (US)** — their standard MSA includes UK SCCs / IDTA. Verify you're on their current version.
- **Railway (US)** — their DPA covers this, check current version.
- **Sentry** — they offer EU-region hosting. Consider switching if not already.
- **PostHog** — you're on EU cloud. Fine.
- **Supabase** — offers EU region. Check yours is EU.
- **MailerLite** — confirm DPA and region.
- **RevenueCat** — DPA available.

**Action:** produce a one-page sub-processors table (copy to Privacy Policy). For each, note jurisdiction, purpose, link to their DPA. Takes ~1 hour. Serves dual purpose of GDPR compliance record + user transparency.

### 9. Trademark

"Etapa" is a common Spanish word and also the name of at least one existing cycling-adjacent brand elsewhere. Before any material marketing spend:

1. Search the UK IPO database ([ipo.gov.uk](https://www.ipo.gov.uk/)) for "Etapa" in classes 9 (software/apps) and 41 (education/training) and 42 (technology services).
2. Check EUIPO (for EU coverage).
3. Check USPTO (for US coverage) — if you plan to distribute to US users.
4. If clear, file a UK trademark — about £170 for one class, £50 per additional class.

**Risk:** if a stronger existing holder in your classes objects after launch, rebranding is expensive and slow.

**Action:** £200 for a basic UK filing is cheap insurance. Do this within the month.

### 10. Insurance — review the TIDE policy carefully

TIDE's bundled insurance is usually general business insurance — often employers' liability and basic public liability. For an AI-backed fitness app, the gaps that matter:

- **Professional indemnity (PI).** Covers claims of negligent advice — *essential* for a coaching product. If a user sues because your AI coach gave them bad advice, PI is what pays the defence costs and any settlement.
- **Cyber liability.** Covers data breach costs (ICO investigation, breach notification, forensic response, remediation). For a pre-revenue company £1–2m cover typically costs a few hundred a year.
- **Product liability.** Covers injury caused by a product defect — relevant if a user claims an injury resulted from following the app.
- **Directors & Officers (D&O).** Protects *you personally* if the company is sued and the claim tries to pierce the corporate veil or name you individually. Given you're a solo director, this is worth having.

**Action:** ask TIDE's insurance what the policy actually covers and doesn't. Get separate quotes for PI + cyber + D&O from Hiscox, Markel, or Simply Business. Expect £500–1500/year total for reasonable cover on a pre-revenue app.

### 11. PECR & email marketing

Privacy and Electronic Communications Regulations 2003 governs marketing emails. Rules relevant to Etapa:

- You need explicit consent before sending marketing emails to a person, OR you can rely on "soft opt-in" for existing customers who had the chance to opt out when their details were collected.
- Every email must have a clear unsubscribe mechanism.
- You must have a sender identity.
- You must honour unsubscribes promptly.

Your `beta-invite.html` already has `{$unsubscribe}` and MailerLite handles compliance plumbing (soft-bounce tracking, one-click unsubscribe headers). Your register-interest flow gives users a chance to opt-in at collection — that creates a basis for future marketing.

**Action:** once launched, audit your email flow against PECR — specifically that pre-launch waitlist emails count as "service update" not unsolicited marketing, and that your register-interest confirmation captures consent clearly. Keep proof of consent (timestamp + IP from signup).

### 12. VAT & international sales

Below the UK VAT registration threshold (£90k) you don't need to register. **However:**

- App Store and Play Store sales to users in the EU, UK, and globally: Apple and Google handle VAT / sales tax for you on their platforms. That's one of the reasons to use their IAP rather than Stripe directly.
- Your register-interest collection is not a revenue event — no VAT implications.
- Once you approach the £90k threshold, register for VAT within 30 days.
- Keep accurate monthly revenue books from day one — TIDE + Xero or FreeAgent is the common small-business setup.

**Action:** nothing to do now other than keep records. Set a calendar reminder at £75k cumulative 12-month revenue to start the VAT registration process.

### 13. Personal guarantees

Check whether you've signed personal guarantees on:

- TIDE account / overdraft
- Apple Developer agreement (you did — Apple's agreement is binding on you personally as the account holder unless you signed as the company)
- Google Play Developer agreement (same)
- Any Railway, Supabase, Anthropic contract where you agreed "I'm personally responsible for this account's charges"

These survive the corporate veil. If the company goes insolvent, personal guarantees remain your liability.

**Action:** make a list of every contract you've signed for Etapa. For each, note whether you're signing as "Etapa Ltd" (director) or personally. Move as many as possible onto the company's name. Apple and Google specifically let you move developer accounts to a company (Organization account type) — do this before any revenue starts.

### 14. Corporate governance — directors duties

Under the Companies Act 2006, as sole director you have statutory duties including: promoting the success of the company, acting with care/skill/diligence, avoiding conflicts of interest, not accepting benefits from third parties, and declaring interests.

Practically for a solo founder:
- Keep a separate business bank account (done — TIDE).
- Don't commingle personal and business spending.
- File annual confirmation statement at Companies House (£13).
- File company accounts annually (micro-entity accounts, can be done yourself or with an accountant).
- Keep minutes of material decisions (you can document decisions in a simple "Director's decision log" markdown file — it's enough for a solo company).

**Action:** create a `COMPANY_LOG.md` (don't commit secrets, but a running log of major decisions — contracts signed, resolutions passed, share issues, investor conversations). Update when anything material happens. This is useful for diligence, future fundraising, and keeping a clean trail if anything is ever contested.

### 15. App store compliance

Apple and Google have their own policy regimes layered on top of UK law:

- **Apple App Store Review Guidelines** — sections 1.4 (Safety), 5.1 (Privacy), 5.2 (Intellectual Property), 3.1 (In-App Purchase). Your app must have a real privacy-policy URL, describe medical/fitness disclaimers, not claim medical effect, not use IAP alternatives.
- **Google Play Developer Policies** — similar, plus the Health & Fitness content rating.

**Content warnings:** Etapa should probably carry the "Fitness" content category and disclose that it contains AI-generated content. Apple's AI generative-content disclosure rules apply.

**Subscriptions:** Apple requires specific paywall disclosures that Etapa's current PaywallScreen mostly meets. Verify on your next review cycle.

**Action:** before first public release, do an Apple + Google policy self-audit against current guidelines. Expect ~2 hours. Main failure modes for AI fitness apps: insufficient medical disclaimer, no mention that content is AI-generated, missing privacy disclosures.

## Personal asset protection — the non-obvious

You asked how to protect yourself external to the business. Five practical things:

1. **Separate company and personal bank accounts rigidly.** TIDE is the company account. Pay yourself a salary / dividend — do not pay personal expenses from TIDE. Commingling is one of the most common reasons courts pierce the corporate veil.

2. **Minimise personal guarantees.** (See #13.) Review your existing contracts. Where personal guarantees exist, try to renegotiate once the company has some trading history.

3. **D&O insurance.** Cheap, protects you personally if someone sues you as a director. A claim against the company that names you individually (common in consumer claims) can drag personal assets into the argument if D&O isn't in place.

4. **Don't hold Etapa-related IP personally.** Trademarks, domain names (`getetapa.com`), the GitHub org — make sure they're owned by Etapa Ltd, not you personally. If owned personally and licensed to the company informally, an insolvency practitioner can go after those assets.

5. **Get a will.** If you're running the company alone and something happens to you, your shares in Etapa Ltd become part of your estate and the company has no one at the wheel. A simple will that nominates a successor director (or at least a specific plan for the shares) is worth doing. ~£100–300 at any UK solicitor.

## Priority action plan

Structured so the highest-leverage work happens first and the solo-founder workload stays manageable.

### This week

- **P0:** decide on Strava — either strip from AI calls, pause the feature, or start a partnership conversation. If you strip, remove the `stravaActivities` from the Claude context in `server/src/routes/ai.js` and the async plan worker. Ship a backend-only change.
- **P0:** pay the ICO data protection fee (£52). 10 minutes online.
- **Document** personal guarantees on every contract signed so far. Move Apple/Google developer accounts to the company if currently personal.

### This month

- **Engage a solicitor** (tech / consumer / data specialist) — budget £1.5k–£3k for a starter engagement. Give them this document. Ask specifically for: ToS, Privacy Policy, EULA, Cookie Policy, Subscription Terms (DMCC-ready), Assumption-of-Risk clause.
- **Get PI, cyber, and D&O insurance quotes** and compare vs TIDE's bundled cover. Likely result: add PI and cyber as separate policies.
- **Search UK IPO and file a trademark** for "Etapa" in classes 9, 41, 42.
- **Harden the coach system prompt** against medical/injury scenarios. Add an automated test that includes adversarial prompts ("I have chest pain, what should I do?") and verifies the response routes to medical help, not training advice.
- **Add an age gate** to onboarding (DOB check, decline signups < 18) OR plan the under-18 compliant experience. Decide with the solicitor.

### Before public launch

- Subscription flow passes a DMCC-readiness checklist (pre-contract info, cancellation parity, reminder notifications). Document the cancellation UX with screenshots — you'll want evidence.
- In-app health disclaimer tick-box before first plan generation, linked to the Terms.
- AI-generated content disclosure on Apple and Google store listings.
- Sub-processors table in Privacy Policy, with each provider's jurisdiction + DPA link.
- Contact page / complaints procedure that meets CMA fair-treatment guidance.

### Ongoing

- Annual: ICO fee renewal, Companies House confirmation statement, company accounts, trademark renewal (every 10 years).
- Quarterly: re-check Strava API terms, Anthropic terms, App Store guidelines for changes.
- Per material incident: log, assess, notify ICO within 72 hours if a personal data breach is likely to result in risk to data subjects.
- Keep the `COMPANY_LOG.md` up to date.

## Questions to take to your solicitor

1. Our beta is live with real users. Does the Strava API restriction expose us to any claim from Strava based on the integration we've built? What's the cleanest remediation path?
2. The DMCC Act 2024 subscription rules come into force in autumn 2026. Our paywall uses Apple/Google IAP via RevenueCat. Which of the new requirements are we responsible for vs. what do the platforms discharge? Can you help us write compliant subscription terms?
3. We're a solo-founder fitness/AI app, pre-revenue. What's the minimum defensible ToS + Privacy Policy + EULA + subscription terms package we need before launch? Fixed fee?
4. The ICO Children's Code says our app is likely to be accessed by under-18s. Given we don't want to actively serve that audience, what's the right mechanism — adult-only terms + DOB check, or is that insufficient?
5. Our AI coach gives cycling training advice. How do we structure the Assumption-of-Risk / health disclaimer to be enforceable under UK law? What language can't we rely on?
6. I'm the sole director. What practical steps beyond good accounting hygiene should I take to protect my personal assets from company liabilities?
7. We have US-based sub-processors (Anthropic, Railway). Is the UK-US Data Bridge the right transfer mechanism or do we need SCCs/IDTA? What documentation do we need?
8. We collect voice/chat messages that could contain health info ("my knee hurts"). Does that make any of our data "special category" under UK GDPR Article 9, requiring an additional lawful basis?

## Sources

- [Bird & Bird — UK subscription law 2026](https://www.twobirds.com/en/insights/2026/uk/new-uk-legislation-to-mean-stricter-rules-for-subscription-services)
- [Hogan Lovells — DMCC Act subscription rules pushed to autumn 2026](https://www.hoganlovells.com/en/publications/uk-subscription-law-shakeup-new-rules-pushed-to-autumn-2026)
- [Cooley — UK Crackdown on Subscription Traps](https://www.cooley.com/news/insight/2024/2024-12-09-uk-crackdown-on-subscription-traps-government-reveals-new-proposals-for-incoming-subscription-contracts-regime-under-dmcc-act)
- [ICO — Data Protection Fee](https://ico.org.uk/for-organisations/data-protection-fee/)
- [ICO — Age Appropriate Design Code (Children's Code)](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/)
- [White & Case — AI Watch: UK regulatory tracker](https://www.whitecase.com/insight-our-thinking/ai-watch-global-regulatory-tracker-united-kingdom)
- [CMS — AI laws and regulations in United Kingdom](https://cms.law/en/int/expert-guides/ai-regulation-scanner/united-kingdom)
- [Strava — Updates to the API Agreement](https://press.strava.com/articles/updates-to-stravas-api-agreement)
- [Strava — API Agreement Update & 3rd Party Apps](https://support.strava.com/hc/en-us/articles/31798729397773-API-Agreement-Update-How-Data-Appears-on-3rd-Party-Apps)
- [DCRainmaker — Strava's changes to kill off apps](https://www.dcrainmaker.com/2024/11/stravas-changes-to-kill-off-apps.html)
- [Moore Barlow — Piercing the Corporate Veil](https://www.moorebarlow.com/blog/the-corporate-veil-an-overview-and-update-from-recent-cases/)
- [Corporate Governance Institute — Exceptions to limited liability](https://www.thecorporategovernanceinstitute.com/insights/guides/exceptions-to-limited-liability-piercing-the-corporate-veil/)
