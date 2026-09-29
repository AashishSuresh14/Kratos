import type { AiMeta as Meta } from '../api/types';
import { formatNumber } from '../lib/format';

/** Small-print provenance for every AI output. */
export function AiMeta({ meta }: { meta: Meta | undefined }) {
  if (!meta) return null;
  return (
    <p className="ai-meta">
      {meta.agent} · {meta.provider}/{meta.model} · {formatNumber(meta.inputTokens)} in / {formatNumber(meta.outputTokens)} out ·{' '}
      {(meta.latencyMs / 1000).toFixed(1)}s{meta.fallbackUsed ? ' · fallback model used' : ''}
    </p>
  );
}

export function AiTag({ label = 'AI' }: { label?: string }) {
  return <span className="ai-tag">{label}</span>;
}
