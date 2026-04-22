# Admin Dashboard — CS Operational Audit

**Reviewer perspective:** senior customer support professional who's handled consumer app escalations for 10+ years. Judging the dashboard on: can a new CS hire sit down and resolve a ticket in five minutes without reading code?

**Scope:** all pages under `admin-dashboard/src/app/dashboard/**`, plus the server-side endpoints they rely on.

**Date:** 22 Apr 2026.

---

## TL;DR

The dashboard covers the common CS journeys (look up user, see plans, respond to feedback, refund payment) but has three CRITICAL gaps and eight smaller ones. I've fixed the two most blocking in this pass — the rest are listed below ordered by priority for you to ship in follow-up PRs.

**Fixed in this pass:**

1. RevenueCat 403 error on the user detail page — root cause was sending `X-Platform: ios` with a server secret key. RC's v1 API treats that combination as a mobile-SDK call and rejects it. Header removed in `server/src/routes/admin.js` + error surface improved with actionable hints.
2. No way to grant lifetime access. Added belt-and-braces flow: `POST /api/admin/users/:id/grant-lifetime` writes to RevenueCat (promotional entitlement, duration=lifetime, entitlement=pro), `user_config_overrides.entitlement = 'lifetime'`, and the `subscriptions` table. Client unlocks via any of the three signals. Idempotent, revocable. Wired to a "Grant Lifetime" button in the user detail Support Actions panel.

---

## Findings by severity

### Critical — fix now

**C1. RevenueCat fetch broken** — already fixed.

**C2. No lifetime grant flow** — already fixed.

### High — should be fixed in the next CS-themed sprint

**H1. Users table doesn't show lifetime status at a glance.**
The plan badge shows "lifetime" only if there's an active `subscriptions.plan='lifetime'` row. The badge should be visually distinct (a magenta chip rather than the generic Badge component) so a CS rep scanning the list for "that user who bought lifetime and says it didn't unlock" can spot them immediately.

**H2. No "reset my plans" action on user detail.**
Most common non-payment ticket: "my plan got weird, can you restart it?" The admin can see plans but can't trigger a reset. Needs an endpoint that marks all their plans as `archived` (not deleted — audit trail) and clears the currently-active flag so the next app open shows the goal setup flow.

**H3. No transaction-ID lookup.**
CS often receives "my receipt says transaction ABC123, can you find my account?" There's no search by Apple/Google transaction id or RC transaction id. Would be cheap to add — Payments page already has the data, just needs a search box.

**H4. No client-side rate limit or double-confirm on `grant-lifetime`.**
The modal does confirm, but nothing stops a CS rep from rapid-clicking while debugging. The server is idempotent so no real damage, but add a 30-second cooldown button state once a grant succeeds.

**H5. Subscriptions refund flow is payment-agnostic.**
`POST /api/admin/refund` exists, but it doesn't capture WHY the refund was issued. For compliance and trend analysis, require a reason dropdown (billing error / duplicate charge / quality / goodwill) + free-text note, and store it on the refund row.

### Medium — quality of life

**M1. No notes/timeline on user detail.**
CS reps need to see "what has been done for this user before?" at a glance. Today they can read feedback + support tickets but there's no internal notes timeline. Suggest: a lightweight `admin_notes` table, user-scoped, with freeform text + author + timestamp. Render inline in the Support Actions panel.

**M2. Config page requires JSON editing.**
Dropping a comma breaks the whole payload. Either add a form builder OR validate the JSON on client before submission with a useful error message pointing at the broken line.

**M3. No bulk actions.**
Can't grant a coupon to multiple users, can't send a push to a cohort, can't export filtered users as CSV. All standard for a mid-stage consumer app. Lowest-hanging is CSV export from the DataTable component.

**M4. Feedback does not surface attachments in the list view.**
The thread renderer handles attachments beautifully, but the list view doesn't indicate which threads have screenshots. Add a paperclip icon + count.

**M5. Tickets page is read-only.**
Can view Linear tickets filtered by "support" in the title, can't create one. CS flow should be: read feedback → decide it's engineering-worthy → "Promote to Linear ticket" button. Already exists for feedback (`linearIssueId` field), but not surfaced as a clear UI primitive.

**M6. No "impersonate user" / session-copy-for-support.**
Not a security issue if done right (JWT with short TTL + audit log). Saves hours in "I can't reproduce your bug" tickets.

### Low — nice-to-have

**L1. Missing `robots: noindex` meta on the admin-dashboard.**
If the domain ever gets indexed, passers-by see the login shell. Set `<meta name="robots" content="noindex, nofollow">` in `layout.tsx`.

**L2. No visual home for the dashboard.**
Hitting `/dashboard` lands on... nothing. Should be a summary page (today's support-ticket count, revenue snapshot, signup-to-paid funnel delta week-over-week). `demo/page.tsx` has some of this shape but is dedicated to the demo A/B test.

**L3. Admins page doesn't show audit trail.**
Granting/revoking admin is high-trust. The page lists current admins but doesn't show who granted them or when. Use the `updated_at` already in the response for the former; add `granted_by` column to the `admins` table for the latter.

---

## Lifetime grant — operational contract

Now that it's shipped, document the expected state after a successful grant:

| Signal | Location | Set to |
|---|---|---|
| RevenueCat promotional entitlement | RC dashboard → subscriber → Entitlements → "pro" | active, duration `lifetime` |
| user_config_overrides | Supabase `user_config_overrides.overrides.entitlement` | `"lifetime"` |
| subscriptions row | Supabase `subscriptions` | plan=`lifetime`, status=`active`, source=`Promotional` |

All three are written by `POST /api/admin/users/:id/grant-lifetime` and the admin UI surfaces the state of each one via check marks so a CS rep can see which one failed if RC is down.

**How the app reads this:**
1. App calls `GET /api/subscription/status`
2. Server finds the `subscriptions` row with plan=lifetime, status=active → returns `active: true`. UI unlocks.
3. If server is unreachable, RC SDK call `getCustomerInfo()` sees the promotional entitlement and unlocks.
4. Remote config merged with the user's override will also set `entitlement=lifetime` — used as a gating check in specific paywalled features.

**Rollback is also idempotent.** `POST /api/admin/users/:id/revoke-lifetime` reverses all three signals.
