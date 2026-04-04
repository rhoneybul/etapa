function isMissingPlanConfigCoachIdColumn(error) {
  if (!error) return false;

  const message = String(error.message || '').toLowerCase();
  const details = String(error.details || '').toLowerCase();
  const hint = String(error.hint || '').toLowerCase();
  const combined = `${message} ${details} ${hint}`;

  const referencesCoachId = combined.includes('coach_id');
  const referencesPlanConfigs = combined.includes('plan_configs');
  const isKnownMissingColumnCode =
    error.code === 'PGRST204' || // PostgREST schema cache lookup failure
    error.code === '42703'; // PostgreSQL undefined_column

  return isKnownMissingColumnCode && referencesCoachId && referencesPlanConfigs;
}

function removeCoachIdField(row) {
  const { coach_id, ...withoutCoachId } = row || {};
  return withoutCoachId;
}

module.exports = {
  isMissingPlanConfigCoachIdColumn,
  removeCoachIdField,
};
