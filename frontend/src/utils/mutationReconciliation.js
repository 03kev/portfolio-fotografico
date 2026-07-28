function parseStructuredString(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (
    !(trimmed.startsWith('{') && trimmed.endsWith('}'))
    && !(trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function canonicalize(value) {
  const parsed = parseStructuredString(value);
  if (Array.isArray(parsed)) return parsed.map(canonicalize);
  if (parsed && typeof parsed === 'object') {
    return Object.keys(parsed)
      .sort()
      .reduce((output, key) => {
        if (parsed[key] !== undefined) output[key] = canonicalize(parsed[key]);
        return output;
      }, {});
  }
  return parsed;
}

export function valuesEquivalent(actual, expected) {
  return JSON.stringify(canonicalize(actual)) === JSON.stringify(canonicalize(expected));
}

export function entityMatchesPatch(entity, patch) {
  if (!entity || !patch || typeof patch !== 'object') return false;
  return Object.entries(patch).every(([field, expected]) => (
    expected === undefined || valuesEquivalent(entity[field], expected)
  ));
}

export function findEntityById(entities, id) {
  if (!Array.isArray(entities)) return null;
  return entities.find((entity) => String(entity?.id) === String(id)) || null;
}

export function includesEntityId(values, id) {
  return Array.isArray(values)
    && values.some((value) => String(value?.id ?? value) === String(id));
}
