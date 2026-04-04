# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Etapa is an AI-powered cycling coaching app. The codebase contains three services:

| Service | Directory | Dev command | Port |
|---|---|---|---|
| Express API server | `server/` | `PORT=3001 node --watch src/index.js` | 3001 |
| Expo mobile app (web) | root (`/workspace`) | `npx expo start --web` | 8081 |
| Admin dashboard (Next.js) | `admin-dashboard/` | `npx next dev --port 3000` | 3000 |

### Important caveats

- The system environment sets `PORT=3002`. The server `.env` sets `PORT=3001`, but `dotenv` does not override existing env vars. **Always start the server with an explicit `PORT=3001`** prefix or unset `PORT` first.
- The root `package.json` `postinstall` runs `patch-package`. This is safe and runs automatically.
- The root `tsconfig.json` extends `expo/tsconfig.base` and has no `exclude`, so running `npx tsc --noEmit` from root picks up `admin-dashboard/` files and reports false errors. Run TypeScript checks separately: `cd admin-dashboard && npx tsc --noEmit`.
- The `jest.config.js` has a typo: `setupFilesAfterSetup` (should be `setupFilesAfterSetup`→`setupFiles`). This produces a warning but tests still run.

### Running tests

- **Server tests:** `cd server && PORT=3099 npm test` (use a non-conflicting port). Tests requiring Supabase need `server/.env.test` — see `server/.env.test.example`.
- **Health tests only** (no external deps): `cd server && PORT=3099 npm test -- --testPathPattern=health`
- **Admin dashboard lint:** No ESLint config is committed; `next lint` will prompt interactively. Use `cd admin-dashboard && npx tsc --noEmit` for type checking.

### Environment files

Copy from examples if missing:
- `.env` ← `.env.example` (Expo app config)
- `server/.env` ← `server/.env.example` (API server)
- `admin-dashboard/.env.local` ← `admin-dashboard/.env.example` (admin dashboard)

Set `EXPO_PUBLIC_PAYWALL_DISABLED=true` in `.env` to bypass paywall during development.

### Supabase and database

- The app uses hosted Supabase (PostgreSQL + Auth). Secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` must be set as environment secrets for the server and app to connect to the database.
- Migrations are in `supabase/migrations/` and must be applied to the Supabase project (via `supabase db push` or the Supabase SQL editor). If you encounter PostgREST errors like "column X does not exist", a migration likely hasn't been applied.
- The server uses the `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS), while the app and auth middleware use the `SUPABASE_ANON_KEY`.
- Sign-in uses Google OAuth (and Apple on iOS). There is no email/password sign-in UI — for programmatic testing, create users via the Supabase admin API: `supabaseAdmin.auth.admin.createUser(...)`.

### Startup sequence

1. Start the API server: `cd server && PORT=3001 node --watch src/index.js`
2. Start the Expo web app: `npx expo start --web` (port 8081)
3. (Optional) Start admin dashboard: `cd admin-dashboard && npx next dev --port 3000`
