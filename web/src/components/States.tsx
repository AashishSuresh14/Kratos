import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Icon, type IconName } from './Icon';

export function EmptyState({
  title,
  children,
  icon = 'inbox',
  action,
}: {
  title: string;
  children?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} className="empty__icon" />
      <div className="empty__title">{title}</div>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/** Explains an API failure in plain words; offers retry where it makes sense. */
/** True for the API's "AI is off or the provider is down" answer (503). */
export const isAiUnavailable = (e: unknown): e is ApiError => e instanceof ApiError && e.status === 503;
export const isRateLimited = (e: unknown): e is ApiError => e instanceof ApiError && e.status === 429;

/** Calm, non-alarming state for AI features when no provider is configured or it is down. */
export function AiUnavailable({ error, onRetry }: { error?: unknown; onRetry?: () => void }) {
  const detail = error instanceof ApiError ? error.detail : undefined;
  return (
    <div className="ai-off" role="status">
      <Icon name="sparkle" className="ai-off__icon" />
      <div className="stack" style={{ ['--gap' as string]: '4px' }}>
        <div className="strong">AI is not available right now</div>
        <p className="small muted">{detail || 'The AI provider is not configured or is not responding. Everything else in Kratos keeps working.'}</p>
        {onRetry && (
          <div>
            <button type="button" className="btn btn--sm" onClick={onRetry}>
              <Icon name="refresh" /> Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  if (isAiUnavailable(error)) return <AiUnavailable error={error} onRetry={onRetry} />;
  let heading = title ?? 'Could not load this';
  let body = 'Something went wrong. Try again in a moment.';
  let retry = true;
  if (error instanceof ApiError) {
    if (error.isForbidden) {
      heading = 'You do not have access';
      body = error.detail ?? 'Your role does not allow this. Ask an admin if you think this is wrong.';
      retry = false;
    } else if (error.isNotFound) {
      heading = 'Not found';
      body = 'It may have been removed, or it is outside your access scope.';
      retry = false;
    } else if (error.status === 429) {
      heading = 'Slow down a little';
      body = error.detail ?? 'Too many requests in a short time. Wait a moment, then try again.';
    } else if (error.isNetwork) {
      heading = 'Cannot reach the Kratos API';
      body = error.detail ?? 'Check your connection, or that the API is running.';
    } else {
      body = error.detail ?? error.title;
    }
  } else if (error instanceof Error) {
    body = error.message;
  }
  return (
    <div className="error-state" role="alert">
      <Icon name="alert" className="error-state__icon" />
      <div className="error-state__title">{heading}</div>
      <p>{body}</p>
      <div className="cluster" style={{ justifyContent: 'center' }}>
        {retry && onRetry && (
          <button type="button" className="btn btn--sm" onClick={onRetry}>
            <Icon name="refresh" /> Try again
          </button>
        )}
        {!retry && (
          <Link to="/" className="btn btn--sm">
            Go to start
          </Link>
        )}
      </div>
    </div>
  );
}

export function Skeleton({ width = '100%', height = 12, style }: { width?: number | string; height?: number; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ width, height, ...style }} aria-hidden="true" />;
}

export function SkeletonLines({ lines = 4 }: { lines?: number }) {
  return (
    <div className="sk-stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={`${90 - ((i * 17) % 40)}%`} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="sk-stack" aria-busy="true" aria-label="Loading table">
      <Skeleton height={14} width="40%" />
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `2fr repeat(${cols - 1}, 1fr)`, gap: 16 }}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} height={12} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonKpis() {
  return (
    <div className="kpis" aria-busy="true" aria-label="Loading figures">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="kpi">
          <Skeleton width="50%" height={11} />
          <Skeleton width="35%" height={28} style={{ marginTop: 6 }} />
        </div>
      ))}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="cluster" role="status">
      <span className="spinner" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}
