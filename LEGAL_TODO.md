# Etapa — Legal to-do list

Companion to `LEGAL_AUDIT.md`. This is the actionable list of things **you** need to do — the full audit explains the *why* behind each item.

> Not legal advice. Items flagged `[SOLICITOR]` must be done by or with a qualified UK solicitor.

## Already implemented in code (as of this session)

These are done in the repo — they still need to deploy but the code is written.

- [x] **Strava data stripped from Claude API calls.** Both `CoachChatScreen` context build and the server-side `coach-chat` endpoint no longer forward Strava activities or week comparisons to the LLM. Comments in both places reference `LEGAL_AUDIT.md`.
- [x] **Coach system prompt hardened with medical guardrails.** `COACH_SYSTEM_PROMPT` in `server/src/routes/ai.js` now includes a non-negotiable "MEDICAL GUARDRAILS" block covering chest pain, cardiac, pregnancy, injury, mental health, medications.
- [x] **In-app health / AI disclaimer** added to `PlanLoadingScreen` — amber-bordered card, visible every time a plan is generated.
- [x] **AI disclosure notice** in `CoachChatScreen` empty state — "Responses are AI-generated. Your coach is a cycling guide, not a doctor."

## This week — no lawyer needed

- [ ] **Pay the ICO data protection fee** (£52). Register at [ico.org.uk/register](https://ico.org.uk/for-organisations/data-protection-fee/register/). Takes 10 minutes. Calendar a renewal for 12 months out.
- [ ] **Audit personal guarantees** on every contract signed for Etapa so far. Open a simple doc listing: contract name → signed as (personal / Etapa Ltd) → PG yes/no → notes. Most-likely culprits: TIDE account opening, Apple Developer agreement, Google Play Developer agreement, any hosting contracts.
- [ ] **Move Apple & Google developer accounts to company ownership** if they're currently on your personal Apple ID / Google account. Apple's "Organization" account type is what you want.
- [ ] **Create `COMPANY_LOG.md`** (don't commit to public repo if you plan to go open-source) — running log of material decisions, contracts signed, resolutions. Useful for diligence later.
- [ ] **Search UK IPO, EUIPO, USPTO** for "Etapa" trademark conflicts in classes 9 / 41 / 42.
- [ ] **Get insurance quotes** for Professional Indemnity, Cyber Liability, and D&O. Try Hiscox, Markel, Simply Business. Compare to what TIDE's bundled cover actually includes.
- [ ] **Redeploy the server** so the Strava-stripping change and the medical-guardrails prompt hardening are actually running against real traffic.

## This month — engage a solicitor

- [ ] **`[SOLICITOR]`** Engage a tech / consumer / data protection solicitor. Budget £1.5k–£3k for a starter engagement. Hand them `LEGAL_AUDIT.md`.
- [ ] **`[SOLICITOR]`** Commission a defensible package:
  - Terms of Service (with UK jurisdiction, user obligations, dispute resolution)
  - Privacy Policy (with sub-processors, international transfers, Children's Code compliance)
  - EULA (for the mobile app — Apple requires one or uses its default)
  - Subscription Terms (DMCC-ready for autumn 2026 — 14-day cooling-off, clear cancellation, pre-contract info, reminder notification policy)
  - Assumption-of-Risk / Health Disclaimer (enforceable UK wording)
  - Cookie / tracking notice (for the website)
  - Acceptable Use Policy (for coach chat abuse cases)
- [ ] **`[SOLICITOR]`** Decide on Children's Code strategy — adult-only terms + DOB gate, or design a compliant under-18 experience.
- [ ] **`[SOLICITOR]`** Confirm the international-data-transfer mechanism for US sub-processors (UK-US Data Bridge vs. UK IDTA vs. SCCs).
- [ ] **File a UK trademark for "Etapa"** once the clearance search is done. ~£170 for one class, £50 per additional class.

## Strava — the P0 open question

The code-level mitigation (not forwarding Strava data to Claude) reduces exposure immediately, but the longer-term question is what happens to the Strava *feature* in Etapa.

- [ ] **`[SOLICITOR]`** Clarify whether past Strava-derived AI context (already used in beta) creates any claim exposure.
- [ ] **Decide feature strategy:**
  - Option A: keep Strava for on-device display only (ride history, planned vs actual). No AI ingestion. Ship as-is.
  - Option B: apply to Strava's commercial partner programme for a carve-out that permits AI use. Slow but preserves the full coach experience.
  - Option C: swap to Apple HealthKit (permissive terms) or Garmin Connect (formal partner programme). Bigger dev work.
- [ ] Document whichever path you choose. If you pick B, start the conversation with Strava now — these take months.

## Before public launch

- [ ] **`[SOLICITOR]`** Sign off on the final ToS / Privacy / EULA / Subscription Terms.
- [ ] **Subscription flow passes a DMCC-readiness check:** pre-contract price disclosure, explicit cooling-off, easy cancellation parity, reminder notifications before trial-end and renewals.
  - Currently Apple/Google handle some of this (system-level cancellation, platform-level trial reminders). You likely still need to fire your own reminder emails via MailerLite before autumn 2026. Spec this after the solicitor review.
- [ ] **Tick-box health consent** at first plan generation — blocks "Generate" until acknowledged. Persists in AsyncStorage. Currently we only show the notice during generation, which is less defensible than an explicit tick.
- [ ] **Age gate at signup** — DOB field, reject under-18 (or route to the under-18 experience, if that's the chosen strategy).
- [ ] **AI-generated content disclosure** on App Store and Play Store listings — required under Apple's new AI disclosure rules.
- [ ] **Sub-processors table** live on the Privacy Policy (Supabase, Railway, PostHog, Sentry, Anthropic, RevenueCat, MailerLite, Apple, Google, Strava). Each row: name / purpose / jurisdiction / DPA link.
- [ ] **Contact + complaints page** that meets CMA fair-treatment guidance.
- [ ] **Cookie banner** on `getetapa.com` (PECR compliance) if you're using any non-essential cookies. If you're only using functional cookies, a notice is enough; if analytics, needs consent.

## Insurance checklist

- [ ] Confirm TIDE bundled cover — what's actually included.
- [ ] **Professional Indemnity** (critical — covers claims of negligent AI advice). Target £1m cover.
- [ ] **Cyber Liability** (covers data-breach response). Target £1m cover.
- [ ] **Directors & Officers** (covers personal exposure for claims against you as director). Target £500k cover.
- [ ] **Product Liability** — potentially relevant for injury-from-the-app claims.
- [ ] Annual review — re-quote each anniversary, cover grows as user base grows.

## Personal-asset protection

- [ ] **Rigidly separate** personal and Etapa Ltd bank accounts. Never pay personal expenses from TIDE.
- [ ] **Set yourself up on PAYE** (salary) or as a shareholder (dividends). Take money out properly — directors' loan accounts run in the wrong direction get ugly fast.
- [ ] **Etapa-related IP owned by Etapa Ltd, not you personally.** Trademarks, domain names (`getetapa.com`), GitHub org. If anything's in your personal name, transfer it.
- [ ] **Simple will** nominating what happens to your Etapa shares if something happens to you. ~£100–300.
- [ ] **`[SOLICITOR]`** optional — consider a shareholders' agreement even as a single shareholder, as a forward-looking document. Useful when you take on a co-founder, advisor, or investor.

## Ongoing / recurring

- [ ] **Annually:** renew ICO fee, file Companies House confirmation statement, file micro-entity accounts.
- [ ] **Quarterly:** re-check Strava API terms, Anthropic T&Cs, App Store guidelines for drift.
- [ ] **After any material data-handling change:** update Privacy Policy + sub-processors table + DPA log.
- [ ] **After any material change to the coach prompt / plan generation:** re-run adversarial medical prompts to verify guardrails hold. Log the test result date.
- [ ] **Per incident:** if there's any personal-data breach, assess within 72 hours whether ICO notification is required. Document the assessment even if you decide not to notify.
- [ ] **After revenue starts:** watch VAT threshold. Register within 30 days of crossing £90k cumulative 12-month revenue.
- [ ] **Before any significant marketing spend** targeting a specific country outside the UK — check that country's consumer and data law. EU is handled by UK GDPR alignment + EU-specific cookie consent. US is a patchwork by state (CCPA / CPRA for California, etc.).

## Red-flag escalation list

If any of these ever happens, go straight to the solicitor — do not wait:

- Letter or email from Strava / Anthropic / any third-party platform alleging breach of terms.
- Letter or email from the ICO / CMA / Advertising Standards Authority.
- Any user claim of injury, harm, or financial loss attributed to an Etapa-generated plan or coach response.
- Trademark opposition or cease-and-desist letter.
- Any data breach that's "likely to result in a risk to the rights and freedoms of natural persons" — 72-hour ICO notification window starts immediately.
- Any payment-related dispute that a user escalates to their card issuer or a regulator.
- A subpoena, court summons, or data-subject access request you're unsure how to handle.

## Questions to ask your solicitor on day one

(Copied from the audit for convenience.)

1. Our beta is live with real users. Does the Strava API restriction expose us to any claim from Strava based on the integration we've built? What's the cleanest remediation path?
2. DMCC Act 2024 subscription rules come into force autumn 2026. Our paywall uses Apple/Google IAP via RevenueCat. Which of the new requirements are we responsible for vs. discharged by the platforms? Can you help us write compliant subscription terms?
3. What's the minimum defensible ToS + Privacy Policy + EULA + subscription-terms package we need before public launch? Fixed-fee engagement?
4. The ICO Children's Code says our app is likely to be accessed by under-18s. Given we don't want to actively serve that audience, what's the right mechanism — adult-only terms + DOB check, or is that insufficient?
5. Our AI coach gives cycling training advice. How do we structure the Assumption-of-Risk / health disclaimer to be enforceable under UK law? What language can't we rely on?
6. I'm the sole director. What practical steps beyond good accounting hygiene should I take to protect my personal assets from company liabilities?
7. We have US-based sub-processors (Anthropic, Railway). Is the UK-US Data Bridge the right transfer mechanism or do we need SCCs/IDTA? What documentation do we need?
8. We collect voice/chat messages that could contain health info ("my knee hurts"). Does that make any of our data "special category" under UK GDPR Article 9, requiring an additional lawful basis?

---

## Cost estimate

Rough budget for the first legal engagement pass:

| Item | Range |
|---|---|
| Solicitor starter package (ToS, Privacy, EULA, Sub Terms, Disclaimer) | £1,500 – £3,000 |
| UK trademark filing (one class) | £170 |
| ICO data protection fee | £52/year |
| PI + Cyber + D&O insurance (year one) | £500 – £1,500/year |
| Simple will | £100 – £300 |
| **Total realistic first-year legal spend** | **£2,500 – £5,500** |

This is one of the most leveraged spends you'll make pre-launch. The cost of getting any single one of these wrong post-launch is significantly higher.
