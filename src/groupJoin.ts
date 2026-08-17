function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function containsAlreadyMemberReason(value: string) {
  const normalized = value.trim().toUpperCase();

  return (
    normalized.includes('ALREADY_GROUP_MEMBER') ||
    /ALREADY(?:\s+A)?\s+GROUP\s+MEMBER/.test(normalized) ||
    /ALREADY(?:\s+A)?\s+MEMBER\s+OF(?:\s+THE)?\s+GROUP/.test(normalized)
  );
}

/**
 * Home can surface Core validation failures as a plain reason, a JSON error
 * body inside Error.message, or a structured bridge error. Recognize only the
 * named validation outcome; numeric codes are intentionally excluded because
 * their meaning is not stable across every layer of the bridge.
 */
export function isAlreadyGroupMemberError(error: unknown) {
  const pending: Array<{ depth: number; value: unknown }> = [{ depth: 0, value: error }];
  const seen = new Set<unknown>();

  while (pending.length > 0) {
    const item = pending.shift();

    if (!item || item.depth > 3 || seen.has(item.value)) {
      continue;
    }

    seen.add(item.value);

    if (typeof item.value === 'string') {
      if (containsAlreadyMemberReason(item.value)) {
        return true;
      }

      try {
        pending.push({ depth: item.depth + 1, value: JSON.parse(item.value) as unknown });
      } catch {
        // Most bridge messages are plain strings rather than JSON bodies.
      }
      continue;
    }

    if (item.value instanceof Error) {
      pending.push({ depth: item.depth + 1, value: item.value.message });
      const cause = (item.value as Error & { cause?: unknown }).cause;
      if (cause !== undefined) pending.push({ depth: item.depth + 1, value: cause });
      continue;
    }

    if (!isRecord(item.value)) {
      continue;
    }

    for (const key of ['cause', 'code', 'errorType', 'message', 'name', 'reason', 'validationResult']) {
      if (key in item.value) pending.push({ depth: item.depth + 1, value: item.value[key] });
    }
  }

  return false;
}
