import { randomUUID } from 'node:crypto';

/**
 * Substitute {{UUID_OUTER}} and {{UUID_INNER}} placeholders in a template
 * string with freshly generated uppercase UUIDs.
 */
export function substituteUuids(template) {
  const outer = randomUUID().toUpperCase();
  const inner = randomUUID().toUpperCase();
  return template
    .replace('{{UUID_OUTER}}', outer)
    .replace('{{UUID_INNER}}', inner);
}
