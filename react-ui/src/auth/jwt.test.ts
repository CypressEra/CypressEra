import { isTokenExpired, safeDecodeJwtPayload, willExpireWithin } from './jwt';

// Build a (header.payload.signature) JWT-shaped string with the given payload.
// We don't sign — the helpers only decode the payload section.
function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${body}.sig`;
}

describe('safeDecodeJwtPayload', () => {
  it('returns the payload object for a well-formed JWT', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const decoded = safeDecodeJwtPayload(makeJwt({ uid: 'u1', email: 'a@b.com', exp }));
    expect(decoded).toMatchObject({ uid: 'u1', email: 'a@b.com', exp });
  });

  it('returns null for garbage', () => {
    expect(safeDecodeJwtPayload('not.a.jwt')).toBeNull();
    expect(safeDecodeJwtPayload('')).toBeNull();
    expect(safeDecodeJwtPayload('only-one-segment')).toBeNull();
  });
});

describe('willExpireWithin', () => {
  it('returns true when exp is past', () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    expect(willExpireWithin(makeJwt({ exp: past }), 0)).toBe(true);
  });

  it('returns true when exp is within the threshold', () => {
    const soon = Math.floor(Date.now() / 1000) + 30;
    expect(willExpireWithin(makeJwt({ exp: soon }), 60_000)).toBe(true);
  });

  it('returns false when exp is far ahead', () => {
    const far = Math.floor(Date.now() / 1000) + 3600;
    expect(willExpireWithin(makeJwt({ exp: far }), 60_000)).toBe(false);
  });

  it('returns false when no exp claim is present', () => {
    expect(willExpireWithin(makeJwt({ uid: 'u1' }), 60_000)).toBe(false);
  });
});

describe('isTokenExpired', () => {
  it('applies the 60s clock-skew buffer', () => {
    // 30s in the future → considered expired (within the 60s buffer).
    const justAhead = Math.floor(Date.now() / 1000) + 30;
    expect(isTokenExpired(makeJwt({ exp: justAhead }))).toBe(true);
    // 120s in the future → safe.
    const aheadEnough = Math.floor(Date.now() / 1000) + 120;
    expect(isTokenExpired(makeJwt({ exp: aheadEnough }))).toBe(false);
  });
});
