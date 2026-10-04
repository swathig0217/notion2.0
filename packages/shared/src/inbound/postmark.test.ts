import { describe, expect, it } from 'vitest';
import { PostmarkInbound, extractInboundToken, inboundEmailText, isAutomated } from './postmark.ts';

const base = PostmarkInbound.parse({
  From: 'sam@acme.example',
  FromFull: { Email: 'sam@acme.example', Name: 'Sam Lee' },
  To: 'a1b2c3d4e5f60718@in.notion2.test',
  ToFull: [{ Email: 'a1b2c3d4e5f60718@in.notion2.test', Name: '' }],
  OriginalRecipient: 'a1b2c3d4e5f60718@in.notion2.test',
  Subject: 'Logo tweaks',
  Date: 'Mon, 5 Oct 2026 09:12:00 -0400',
  TextBody: 'Could you make it bolder by Friday?',
  HtmlBody: '',
  Headers: [],
});

describe('extractInboundToken', () => {
  it('reads the token from the recipient at our domain', () => {
    expect(extractInboundToken(base, 'in.notion2.test')).toBe('a1b2c3d4e5f60718');
  });
  it('supports plus-addressing and case differences', () => {
    const p = { ...base, OriginalRecipient: 'A1B2C3D4E5F60718+acme@IN.notion2.test', ToFull: [] };
    expect(extractInboundToken(p, 'in.notion2.test')).toBe('a1b2c3d4e5f60718');
  });
  it('finds the address in Cc when forwarded with others', () => {
    const p = {
      ...base,
      OriginalRecipient: '',
      ToFull: [{ Email: 'me@gmail.com', Name: '' }],
      CcFull: [{ Email: 'a1b2c3d4e5f60718@in.notion2.test', Name: '' }],
    };
    expect(extractInboundToken(p, 'in.notion2.test')).toBe('a1b2c3d4e5f60718');
  });
  it('ignores other domains and malformed tokens', () => {
    expect(extractInboundToken(base, 'other.test')).toBeNull();
    expect(
      extractInboundToken(
        { ...base, OriginalRecipient: 'x@in.notion2.test', ToFull: [] },
        'in.notion2.test',
      ),
    ).toBeNull();
  });
});

describe('isAutomated', () => {
  it('detects auto-replies and bounces', () => {
    expect(
      isAutomated({ ...base, Headers: [{ Name: 'Auto-Submitted', Value: 'auto-replied' }] }),
    ).toBe(true);
    expect(isAutomated({ ...base, Headers: [{ Name: 'Precedence', Value: 'bulk' }] })).toBe(true);
    expect(isAutomated({ ...base, FromFull: { Email: 'MAILER-DAEMON@x.com', Name: '' } })).toBe(
      true,
    );
    expect(isAutomated({ ...base, Headers: [{ Name: 'Auto-Submitted', Value: 'no' }] })).toBe(
      false,
    );
    expect(isAutomated(base)).toBe(false);
  });
});

describe('inboundEmailText', () => {
  it('formats a header block and the text body', () => {
    expect(inboundEmailText(base)).toBe(
      'From: Sam Lee <sam@acme.example>\nSubject: Logo tweaks\nDate: Mon, 5 Oct 2026 09:12:00 -0400\n\nCould you make it bolder by Friday?',
    );
  });
  it('falls back to readable text from HTML', () => {
    const t = inboundEmailText({
      ...base,
      TextBody: '',
      HtmlBody: '<p>Hi&nbsp;there</p><ul><li>one</li><li>two</li></ul><script>x()</script>',
    });
    expect(t).toContain('Hi there');
    expect(t).toContain('- one');
    expect(t).not.toContain('x()');
  });
  it('caps very long emails', () => {
    const t = inboundEmailText({ ...base, TextBody: 'a'.repeat(30_000) });
    expect(t.length).toBeLessThanOrEqual(20_000);
    expect(t.endsWith('[truncated]')).toBe(true);
  });
});
