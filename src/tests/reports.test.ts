import { describe, expect, it } from 'vitest';
import type { ReportClaim } from '../lib/types';
import { computeCoverage, coverageBreakdown } from '../services/reports';

function claim(supported: boolean): ReportClaim {
  return {
    id: Math.random().toString(36),
    text: supported ? 'A cited finding.' : 'No verified record found.',
    sourceRefs: supported ? [{ docId: 'd1', docName: 'Doc', pageNo: 1, snippet: 'x' }] : [],
    verified: supported,
    kind: supported ? 'finding' : 'missing',
  };
}

describe('computeCoverage (Source Coverage, not accuracy)', () => {
  it('returns null when there are no factual claims', () => {
    expect(computeCoverage({ claims: [] })).toBeNull();
  });

  it('returns 100 when every claim has a source', () => {
    expect(computeCoverage({ claims: [claim(true), claim(true)] })).toBe(100);
  });

  it('returns the supported proportion otherwise', () => {
    expect(computeCoverage({ claims: [claim(true), claim(false), claim(false), claim(false)] })).toBe(25);
  });
});

describe('coverageBreakdown', () => {
  it('reports totals, supported and awaiting-verification counts', () => {
    const b = coverageBreakdown({ claims: [claim(true), claim(true), claim(false)] });
    expect(b.totalClaims).toBe(3);
    expect(b.supported).toBe(2);
    expect(b.awaitingVerification).toBe(1);
    expect(b.coverage).toBeCloseTo(66.7, 1);
  });

  it('treats an empty claim set as not applicable', () => {
    const b = coverageBreakdown({ claims: [] });
    expect(b.coverage).toBeNull();
    expect(b.awaitingVerification).toBe(0);
  });
});
