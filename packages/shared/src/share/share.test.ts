import { describe, expect, it } from 'vitest';
import { shareToCapture } from './share.ts';

describe('shareToCapture', () => {
  it('shares plain text', () => {
    expect(shareToCapture({ text: '  Call Acme about the logo ' }, 20000)).toEqual({
      mode: 'text',
      text: 'Call Acme about the logo',
    });
  });

  it('adds a shared link with its page title', () => {
    expect(
      shareToCapture({ webUrl: 'https://acme.test/brief', meta: { title: 'Acme brief' } }, 20000),
    ).toEqual({
      mode: 'text',
      text: 'Acme brief\nhttps://acme.test/brief',
    });
    expect(shareToCapture({ text: 'see https://x.test', webUrl: 'https://x.test' }, 20000)).toEqual(
      {
        mode: 'text',
        text: 'see https://x.test',
      },
    );
  });

  it('takes the first supported image, with any text as its note', () => {
    expect(
      shareToCapture(
        {
          text: 'from Sam',
          files: [
            { path: '/tmp/a.pdf', mimeType: 'application/pdf', size: 10 },
            { path: '/tmp/b.PNG', mimeType: 'IMAGE/PNG', size: 2048 },
          ],
        },
        20000,
      ),
    ).toEqual({
      mode: 'image',
      image: { uri: 'file:///tmp/b.PNG', mimeType: 'image/png', fileSize: 2048 },
      text: 'from Sam',
    });
    expect(
      shareToCapture(
        { files: [{ path: 'content://media/1', mimeType: 'image/jpeg', size: null }] },
        20000,
      ),
    ).toMatchObject({ mode: 'image', image: { uri: 'content://media/1' } });
  });

  it('rejects unsupported or empty shares', () => {
    expect(
      shareToCapture({ files: [{ path: '/a.pdf', mimeType: 'application/pdf', size: 1 }] }, 20000),
    ).toEqual({
      mode: 'unsupported',
      reason: 'file_type',
    });
    expect(shareToCapture({ text: '   ' }, 20000)).toEqual({
      mode: 'unsupported',
      reason: 'empty',
    });
  });

  it('caps text length', () => {
    const r = shareToCapture({ text: 'x'.repeat(50) }, 10);
    expect(r).toEqual({ mode: 'text', text: 'x'.repeat(10) });
  });
});
