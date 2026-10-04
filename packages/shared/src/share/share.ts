/**
 * Content shared into the app from the OS share sheet, normalized into what Dump it
 * accepts: text (with any link appended) or one image.
 */

export interface SharedFile {
  path: string;
  mimeType: string;
  fileName?: string | null;
  size: number | null;
}

export interface SharedPayload {
  text?: string | null;
  webUrl?: string | null;
  files?: readonly SharedFile[] | null;
  meta?: { title?: string | null } | null;
}

export const SHARE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type ShareCapture =
  | { mode: 'text'; text: string }
  | {
      mode: 'image';
      image: { uri: string; mimeType: string; fileSize: number | null };
      text: string;
    }
  | { mode: 'unsupported'; reason: 'empty' | 'file_type' };

function normalizeUri(path: string): string {
  return /^[a-z]+:\/\//i.test(path) ? path : `file://${path}`;
}

export function shareToCapture(payload: SharedPayload, maxChars: number): ShareCapture {
  const title = payload.meta?.title?.trim() ?? '';
  const text = payload.text?.trim() ?? '';
  const url = payload.webUrl?.trim() ?? '';
  const parts: string[] = [];
  if (text) parts.push(text);
  if (url && !text.includes(url))
    parts.push(title && !text.includes(title) ? `${title}\n${url}` : url);
  const body = parts.join('\n\n').slice(0, maxChars);

  const files = payload.files ?? [];
  if (files.length > 0) {
    const image = files.find((f) =>
      (SHARE_IMAGE_TYPES as readonly string[]).includes(f.mimeType.toLowerCase()),
    );
    if (image) {
      return {
        mode: 'image',
        image: {
          uri: normalizeUri(image.path),
          mimeType: image.mimeType.toLowerCase(),
          fileSize: image.size,
        },
        text: body.slice(0, 500),
      };
    }
    if (!body) return { mode: 'unsupported', reason: 'file_type' };
  }
  if (!body) return { mode: 'unsupported', reason: 'empty' };
  return { mode: 'text', text: body };
}
