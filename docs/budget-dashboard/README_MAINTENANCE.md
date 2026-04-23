# Keeping Your Finance Model Accurate

> **This is for you (Rob), not Claude Code.** It's the shortest possible explanation of how to keep the Excel model useful week-to-week until the dashboard is built.

---

## The one thing that matters most

Update `Assumptions!B4` (Tide balance) every Monday. Everything else recalculates from that single cell. If you miss a week, no disaster. If you miss three weeks, the whole model is lying to you.

---

## Weekly rhythm (5 min, every Monday)

1. **Open Tide app** → copy cleared balance → paste into `Assumptions` tab, cell `B4`
2. **Open the `To-Do` tab** → change status of anything completed last week to `Done`
3. **Glance at the `Dashboard` tab** — if runway cell turns red, act same day

That's it. Three steps.

---

## Monthly rhythm (15 min, first Monday of each month)

1. **Export Tide CSV**: Tide app → Transactions → Export → select "Last month" → download
2. **Paste into `Tide Txns` sheet**: select all rows in the sheet from row 4 down, delete, then paste the new export
3. **Open `Watchlist` tab** — is anything charging that wasn't before? If yes, add a row in `Assumptions` rows 8-17
4. **Update RevenueCat numbers** (only once app is live): go to `SaaS Metrics` tab, update yellow cells
5. **Review `Personal Subs` tab** — anything you're paying for but not using? Cancel it

---

## Quarterly rhythm (30 min, first Monday of Jan/Apr/Jul/Oct)

1. **`Cash Forecast` tab** — does the line still look viable? If closing balance goes below zero within 6 months, start thinking about funding.
2. **`Milestones` tab** — mark anything you've hit with today's date in the "Date hit" column.
3. **`Red Zones` tab** — any row amber or red? Each has an action column that tells you what to do.
4. **`Funding Options` tab** — if you haven't applied for SEIS Advance Assurance, do it now. It's free and takes 4-8 weeks.

---

## When things change

| Event | What to do |
|---|---|
| New recurring cost (e.g. you sign up for a new SaaS tool) | Add a row in `Assumptions` rows 8-17. Put the monthly cost in column B, name in A, note in C. |
| Cancelled something | Change its value to 0, update the note to say "✓ Cancelled [date]". Keep the row so you have history. |
| Did something on the to-do list | Go to `To-Do` tab, change the Status dropdown to `Done`. It strikes through automatically. |
| Got paid (revenue event) | Nothing. The monthly Tide CSV import will catch it. If it's the first payment ever, celebrate. |
| Injected personal money into Tide | Add to `Assumptions!B28` (Capital injected YTD). This is your Director's Loan. |
| Company paid you back | Subtract from `Assumptions!B28`. This reduces the Director's Loan balance. |
| Moved a subscription off personal card | Update the note in the relevant `Assumptions` row to say "✓ Card on Tide [date]". |

---

## What NOT to touch

- **Black text** — these are formulas. Don't overwrite. If you do, press Ctrl+Z immediately.
- **Green text** — cross-sheet references. Same rule: don't overwrite.
- **Any cell in the `Dashboard`, `Cash Forecast`, `Pricing`, `Red Zones`, `Milestones` tabs** unless you know what you're doing.

The only cells you should ever edit are:
- **Yellow background** cells (inputs)
- **Status column** on the `To-Do` tab
- **Notes** columns throughout

---

## When something breaks

If a number looks wrong:
1. Check `Assumptions!B4` (Tide balance) — is it fresh?
2. Check the `Tide Txns` tab — did you paste this month's data?
3. Still wrong? Open the `How to Use` tab. Formulas there explain what each sheet does.
4. Still stuck? The source-of-truth is the Excel file. If it's critical, revert to a backup.

---

## Migrating to the dashboard

Once the dashboard is built, this document becomes obsolete. The dashboard handles all of this automatically:
- RevenueCat webhooks replace manual MRR updates
- Tide CSV upload is a drag-drop on the transactions page
- To-dos are on a dedicated page with status dropdowns
- The runway calc is live in the header bar

**Until then, the Excel model is the source of truth.** Keep it updated or the numbers mean nothing.

---

## One last thing

This model took several hours to build. It's worth 30 seconds of your Monday morning to keep it alive. Founders who ignore their numbers are founders who run out of money "suddenly". Don't be one of those.
