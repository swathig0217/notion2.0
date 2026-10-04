import { Platform } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { env } from './env';

let enabled = false;

/**
 * Error reporting without user content: no default PII, no breadcrumbs carrying
 * console output or UI text, and request bodies are never attached.
 */
export function initSentry() {
  if (!env.sentryDsn || Platform.OS === 'web') return;
  Sentry.init({
    dsn: env.sentryDsn,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console' || breadcrumb.category?.startsWith('ui.')) return null;
      if (breadcrumb.data) delete breadcrumb.data.body;
      return breadcrumb;
    },
  });
  enabled = true;
}

/** Reports an error with non-content tags only (table names, ops, codes). */
export function reportError(error: unknown, tags: Record<string, string> = {}) {
  if (enabled) Sentry.captureException(error, { tags });
  else if (__DEV__) console.warn('[error]', tags, error);
}
