-- ──────────────────────────────────────────────────────────────────────────
-- finance schema — grant table-level privileges to the authenticated role.
--
-- The Phase 1 migration (20260423000002_finance_schema.sql) created the
-- schema + tables + RLS policies, but didn't GRANT privileges to the
-- `authenticated` role that Supabase's JWT sessions assume. Without these,
-- PostgREST returns "permission denied for schema finance" even with RLS
-- correctly configured — RLS only filters rows, it doesn't grant table
-- access in the first place.
--
-- The grants below give authenticated users the SQL-level right to touch
-- finance tables; RLS then filters those touches to allowlisted admins
-- only (via the `admin_full_access` policy keyed on finance.is_admin()).
-- Non-admin authenticated users are allowed to issue the query but RLS
-- returns zero rows / blocks the write.
--
-- service_role is also granted because the server-side webhook handlers
-- on the Express backend use the service role key; it bypasses RLS but
-- still needs SQL-level privileges.
-- ──────────────────────────────────────────────────────────────────────────

-- Let both roles USE the schema (find objects inside it).
grant usage on schema finance to authenticated, service_role;

-- CRUD on every existing table in the schema.
grant select, insert, update, delete on all tables in schema finance
  to authenticated, service_role;

-- BIGSERIAL primary keys + any other sequences need USAGE (nextval) + SELECT
-- (currval) so that insert statements can generate IDs.
grant usage, select on all sequences in schema finance
  to authenticated, service_role;

-- Functions — is_admin() is the RLS predicate, every policy calls it on
-- every row check, so authenticated must be able to EXECUTE it. (It's
-- already SECURITY DEFINER so it runs with the creator's privileges, but
-- EXECUTE is still needed to invoke.)
grant execute on all functions in schema finance
  to authenticated, service_role;

-- Default privileges — anything NEW we add to this schema later (migrations,
-- helper tables) inherits the same grants automatically. Without this,
-- Phase 3+ tables would hit the same "permission denied" error until
-- someone manually granted them.
alter default privileges in schema finance
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema finance
  grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema finance
  grant execute on functions to authenticated, service_role;
