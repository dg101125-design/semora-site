// Shared with build_site.py: keep this literal JSON so form limits use the
// same contract as the API. Length is UTF-16 units, matching maxlength.
export const MAX_BODY_BYTES = 1024 * 1024;
export const FIELD_LIMITS = {
  "name": 4000, "practice": 4000, "email": 4000, "phone": 4000,
  "website": 4000, "vertical": 4000, "want": 4000, "found": 4000,
  "prompt": 4000, "source": 4000, "q_problem": 4000,
  "q_decision": 4000, "q_budget": 4000, "q_timing": 4000,
  "q_access": 4000, "q_guarantee": 4000
};

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function validateFields(body) {
  const fields = {}, errors = {};
  for (const [name, max] of Object.entries(FIELD_LIMITS)) {
    const value = body[name] ?? '';
    if (typeof value !== 'string') {
      errors[name] = 'Please enter text for this field.';
      continue;
    }
    fields[name] = value.trim();
    if (fields[name].length > max) errors[name] = `Use no more than ${max.toLocaleString('en-AU')} characters.`;
  }
  return { fields, errors };
}
