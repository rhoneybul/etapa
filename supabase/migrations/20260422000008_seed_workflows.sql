-- ── Seed workflows config ────────────────────────────────────────────────────
-- Server-driven screen-level workflow overrides. Empty by default —
-- every screen renders normally until an admin flips a switch.
--
-- Schema:
--   workflows = {
--     screens: {
--       <ScreenName>: {
--         disabled:     boolean,   -- show a "taking a break" panel instead
--         redirectTo:   string,    -- auto-navigate on mount to this screen
--         disabledCopy: string     -- message shown when disabled
--       }
--     }
--   }
--
-- Clients consult this via src/hooks/useScreenGuard.js on every screen
-- that's been wrapped. Screens without the hook ignore these overrides —
-- which is fine, it's purely additive (see REMOTE_FIRST_CHECKLIST.md).
--
-- Example (only as a reference — kept commented out in case someone
-- runs this by hand):
--
--   workflows.screens.PlanLoadingScreen = {
--     "disabled": false,
--     "redirectTo": null,
--     "disabledCopy": "Plan generation is paused — back in a few minutes"
--   }

insert into public.app_config (key, value)
values ('workflows', jsonb_build_object('screens', jsonb_build_object()))
on conflict (key) do nothing;  -- never clobber admin edits on re-run
