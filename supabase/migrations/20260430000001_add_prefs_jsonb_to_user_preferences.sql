-- Add `prefs` JSONB column to `user_preferences`.
--
-- Stores forward-compatible per-user preferences that don't merit a
-- typed column of their own — gearInventory, location.country, units,
-- coachTipHistory (sentIds, optedOutIds), unavailableDates,
-- chatLanguageByCoach, prefsVersion sentinel.
--
-- Server endpoints assume this column exists:
--   PUT  /api/preferences           merges req.body.prefs into this blob
--   POST /api/checkins/tip/:id/opt-out      reads/writes coachTipHistory
--   POST /api/checkins/tip/:id/re-enable    reads/writes coachTipHistory
--   sendCheckin (server/src/routes/checkins.js) reads gearInventory + location
--
-- Client also reads it on boot via hydratePrefsFromServer() and pushes
-- updates via setUserPrefs() so a reinstall picks up cross-device state.
--
-- Default '{}' so existing rows don't need a separate backfill — every
-- read of the blob falls back to an empty object.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

-- GIN index for the rare admin/queries path where we'd want to filter
-- on a key inside the blob (e.g. "all riders with gearInventory.helmet
-- = false"). Cheap to maintain on a low-write column.
CREATE INDEX IF NOT EXISTS user_preferences_prefs_gin
  ON public.user_preferences USING GIN (prefs);
