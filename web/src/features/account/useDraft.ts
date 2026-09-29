import { useCallback, useMemo, useState } from 'react';

/** Local editable copy of a server value, with a dirty flag and reset. */
export function useDraft<T>(source: T) {
  const [draft, setDraft] = useState<T>(() => structuredClone(source));
  const sourceJson = useMemo(() => JSON.stringify(source), [source]);
  const dirty = useMemo(() => JSON.stringify(draft) !== sourceJson, [draft, sourceJson]);
  const reset = useCallback(() => setDraft(JSON.parse(sourceJson) as T), [sourceJson]);
  const patch = useCallback((p: Partial<T>) => setDraft((d) => ({ ...d, ...p })), []);
  return { draft, setDraft, patch, dirty, reset };
}
