# Remote-First Checklist

> The day-to-day companion to [REMOTE_FIRST_ARCHITECTURE.md](./REMOTE_FIRST_ARCHITECTURE.md).
> That doc tells you *why*. This one tells you *what boxes to tick* on every change.

**Every PR that touches user-facing behaviour goes through this checklist.** No exceptions. If a box cannot be ticked, explain why in the PR description.

---

## The golden rule

> **We must never ship a change that breaks the app for users who haven't updated.**

There are still users on builds from last week, and last month, and last quarter. Every change we make has to work for all of them. The mental model:

- **Backend is always the newest thing**. When a client opens the app, the backend might already have v5 copy + v5 pricing + v5 feature flags. The client might be on v1.
- **Old clients ignore fields they don't know about**. That's fine.
- **Old clients crash if a field they rely on disappears or changes shape**. That's not fine.
- **So: we only ADD fields. We never REMOVE them. We never CHANGE the shape of an existing field.**

If you think you need to change the shape, the right move is: add a new field with a new name, migrate clients to read from it, wait for adoption, then (maybe, eventually, carefully) remove the old one.

---

## The 10-box checklist for every change

### Copy + strings

- [ ] **Every new user-facing string has a copy key.** Not a literal in the component. Use `remoteConfig.t('copy.myScreen.title', 'Fallback that works without network')`.
- [ ] **Every copy key has a bundled fallback.** The fallback is the version of the string that shipped in this build. If the server returns nothing, the app still renders something sensible.
- [ ] **Seed the new key in `app_config`** via a migration (`supabase/migrations/XXXX_seed_copy_XYZ.sql`). That way the admin dashboard shows it as editable on day one, instead of "none of these keys exist yet".

### Feature flags

- [ ] **Every new feature ships behind a flag.** Default to on for new installs, but the flag must exist and be flippable from the admin.
- [ ] **The flag name matches the convention:** `features.<camelCaseFeatureName>.enabled`. The gating check is `remoteConfig.getBool('features.X.enabled', true)`.
- [ ] **If the flag is OFF, the feature renders NOTHING.** No placeholder, no "coming soon" unless the copy is remote too. A flipped-off feature should look identical to a world where the feature doesn't exist.

### Data shape

- [ ] **No removed fields.** Check every existing remote-config key you touch — you can only ADD to it.
- [ ] **No renamed fields.** Adding `user.displayName` is fine; renaming `user.name` to `user.displayName` breaks every old client that reads `user.name`.
- [ ] **No changed types.** If `pricing.monthly` was an integer (pence), it stays an integer. If we need a currency object instead, it goes at `pricing.monthlyObj` and the old field keeps working forever.

### Server

- [ ] **Endpoints are additive.** Adding `/api/foo/v2` is fine. Changing the response shape of `/api/foo` is not — old apps are still calling it.
- [ ] **Version-adapt when you have to.** If a new payload shape exists that old apps can't parse, gate it behind `if (clientVersion >= '1.2.0')` on the server and serve the legacy shape below that. See `server/src/lib/versionAdapt.js`.

### Client

- [ ] **Reads, don't assume.** Always `get(path, fallback)` or `getJson(path, fallback)`. Never `config.foo.bar.baz` — that crashes if `foo` is missing.
- [ ] **Optional chaining everywhere.** Any time you reach into a remote value, use `?.` and a fallback. A missing field must not throw.

---

## Naming conventions

| Thing | Key pattern | Example |
|---|---|---|
| Copy string | `copy.<screen>.<element>` | `copy.signIn.titleMain` |
| Error message | `errors.<area>.<code>` | `errors.plan.generateFailed` |
| Feature flag | `features.<feature>.enabled` | `features.stravaSync.enabled` |
| Global config block | snake_case at the top level | `pricing_config`, `trial_config` |
| Per-user override | camelCase JSON keys | `entitlement`, `coachesUnlocked` |

**Screen names in copy keys match the React component name, lowercased.** `SignInScreen` → `copy.signIn.*`. `HomeScreen` → `copy.home.*`. Reliably lookup-able.

---

## Recipes

### "I want to change a piece of copy right now"

1. Open admin dashboard → `/dashboard/config`
2. Find the `copy` key (or add it) → edit the sub-path
3. Hit save → live within 60s for all users on any version

If the key doesn't exist yet, the app falls back to its bundled string. You can ship the admin-editable version in the next build without any urgency.

### "I want to disable a broken feature for all users"

1. Admin dashboard → `/dashboard/config` → `features`
2. Set `features.<name>.enabled = false`
3. Every app on every version that gates its UI on that flag hides the feature on next config fetch (max 60s later)

This is the fire drill. **It only works if the feature was gated properly at build time.** That's why the flag check is on the checklist.

### "I want to grant one user access to something"

1. Admin dashboard → that user's profile → Quick actions
2. Pick the action (grant lifetime, unlock coaches, grant free month, etc.)
3. Writes to `user_config_overrides.overrides`. The server merges that into the user's `/api/app-config` payload. The app picks it up automatically.

### "I want to add a new field to a config section without breaking old apps"

Just add it. Old apps don't look for it; new apps read it with a fallback. No coordination needed.

### "I want to change the SHAPE of an existing field"

You can't — not safely. Here's the pattern:

1. Add the new field under a new name (e.g. `pricing.monthlyV2` as an object instead of `pricing.monthly` as an integer).
2. Ship a build of the app that reads `pricing.monthlyV2` **if present**, else falls back to `pricing.monthly`.
3. Wait until force-upgrade kicks in (`min_app_version`) or adoption is ≥ 99%.
4. Only then consider removing the legacy field. Most of the time, don't bother — the cost of leaving it in is zero.

### "I want to add a whole new config section"

1. Add to `DEFAULTS` in `src/services/remoteConfig.js` so old clients get a sane fallback.
2. Add a seed row in a migration so `app_config.your_new_key` exists.
3. Add a section to `buildPayload()` in `server/src/routes/appConfig.js` that maps your new config row to the client shape.
4. Add an admin UI in `/dashboard/config` so you can edit it.
5. Clients that don't know about the section ignore the field entirely.

---

## Version adaptation — when it's actually needed

99% of changes don't need version adaptation. You just add fields. Old clients ignore them.

Version adaptation is for the 1% of cases where old and new clients genuinely need a different shape. Examples:

- Old clients expect `coaches: Coach[]` but we want to add grouping and need `coaches: { beginners: Coach[], advanced: Coach[] }`
- A legal requirement: EU clients on v1.5+ need price-inclusive-of-VAT display; old clients would break

For those, use the server helper:

```js
// server/src/lib/versionAdapt.js
const { atLeast } = require('../lib/versionAdapt');

if (atLeast(req.headers['x-app-version'], '1.5.0')) {
  payload.coaches = groupedCoachesShape;
} else {
  payload.coaches = flatLegacyShape;  // what old apps expect
}
```

See `server/src/lib/versionAdapt.js` for the API.

---

## Min-version gating — the fire-exit

When a bug is so bad that old clients MUST upgrade, set `min_app_version.ios` / `.android` in `app_config` to the smallest version you consider safe. Older clients see `ForceUpgradeScreen` on boot.

Use this sparingly — it's aggressive. Acceptable reasons:

- A security vulnerability fixed in the new build
- A data-corruption bug in the old build
- A legal compliance issue

Not acceptable:

- "We want everyone on the latest features"
- "The old version looks dated"

Mild encouragement (a banner saying "Update available") is the right move for non-urgent upgrades. The `banner` remote config value exists for exactly this.

---

## Failure modes we care about

| Scenario | What should happen | What we check |
|---|---|---|
| Server is down | App uses AsyncStorage cache. If no cache, uses bundled defaults. Boots normally. | `remoteConfig.init()` never throws |
| Server returns malformed JSON | Cached config kept. No crash. Error logged to Sentry. | typed getters (`getString`, `getBool`, `getJson`) filter bad types |
| Server returns empty payload | App uses bundled defaults. | every getter has mandatory fallback |
| New server field old client doesn't know about | Old client silently ignores it. No crash. | additive-only rule |
| Old server field a new client expects | New client uses bundled default. No crash. | additive-only rule |
| User is offline on first open ever | App uses bundled defaults. Boots. | `DEFAULTS` covers everything the UI needs |

---

## When you're about to break this

Stop. Put the code down. Think about whether there's an additive path. 99% of the time there is.

The 1% of the time there isn't, write a design note explaining:

- What shape change is needed
- What the impact is on clients below version X
- What the migration plan is (two-phase rollout, force-upgrade, etc.)
- Why the additive path doesn't work

Drop that in the PR. Then we talk.

---

## Related

- [REMOTE_FIRST_ARCHITECTURE.md](./REMOTE_FIRST_ARCHITECTURE.md) — the doctrine, the why
- `src/services/remoteConfig.js` — the client
- `src/hooks/useRemoteText.js` — the one-liner hook for copy
- `server/src/routes/appConfig.js` — the endpoint
- `server/src/lib/versionAdapt.js` — the semver helper for version-gated shapes
- `supabase/migrations/*seed_copy*` — seed migrations for new copy keys
