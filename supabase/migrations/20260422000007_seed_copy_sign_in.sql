-- ── Seed copy keys for SignInScreen ──────────────────────────────────────────
-- See REMOTE_FIRST_CHECKLIST.md §"I want to add a whole new config section".
-- Seeding the copy block into app_config means the admin dashboard shows the
-- keys as editable immediately, rather than "no config found". Values below
-- match the bundled fallbacks in src/screens/SignInScreen.js so even if the
-- server returns this seed unchanged, nothing visibly changes.
--
-- Pattern for future screens: add a new migration per screen called
-- 20260XXXXXXXX_seed_copy_<screenName>.sql and merge the copy object.

insert into public.app_config (key, value)
values (
  'copy',
  jsonb_build_object(
    'signIn', jsonb_build_object(
      'appTitle',       'Etapa',
      'chipGoal',       'Any goal, any level',
      'chipCoach',      'A coach in your pocket',
      'chipPlans',      'Plans that fit real life',
      'appleContinue',  'Continue with Apple',
      'appleLoading',   'Signing in...',
      'googleContinue', 'Continue with Google',
      'googleLoading',  'Signing in...',
      'termsPrefix',    'By continuing you agree to our',
      'termsOfService', 'Terms of Service',
      'termsAnd',       'and',
      'privacyPolicy',  'Privacy Policy'
    )
  )
)
on conflict (key) do update
  -- Deep-merge the new signIn block into whatever's already stored under
  -- copy. This is a jsonb || union — right-hand keys win. That means:
  --   - if `copy` already has e.g. a `home` sub-block, it's preserved
  --   - if `copy.signIn` was already populated (by a later edit), this
  --     migration DOES overwrite it back to the seeded defaults
  -- The second behaviour is only a problem on first apply; once the admin
  -- edits through the dashboard, they're editing the merged value which
  -- already includes any newer fields.
  set value = public.app_config.value || excluded.value
  where public.app_config.key = 'copy';
