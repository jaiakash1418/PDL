import { describe, expect, it } from 'vitest';
import {
  periodLabel, periodSortKey, fmtBytes, truncate, initials, titleCase,
  clamp, ext, stableStringify, statusTone, severityTone, reportTone,
  conflictTone, dupTone,
} from '../lib/util';

describe('reporting period helpers', () => {
  it('labels a canonical YYYY-MM period', () => {
    expect(periodLabel('2024-03')).toBe('Mar 2024');
    expect(periodLabel('2024-12')).toBe('Dec 2024');
  });

  it('returns the raw value when it is not canonical', () => {
    expect(periodLabel('Q1 FY24')).toBe('Q1 FY24');
  });

  it('sorts periods chronologically', () => {
    const periods = ['2024-12', '2023-01', '2024-02'];
    const sorted = [...periods].sort((a, b) => periodSortKey(a) - periodSortKey(b));
    expect(sorted).toEqual(['2023-01', '2024-02', '2024-12']);
  });
});

describe('formatting helpers', () => {
  it('formats byte sizes', () => {
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(2048)).toBe('2.0 KB');
  });

  it('truncates with an ellipsis', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
    expect(truncate('abc', 5)).toBe('abc');
  });

  it('derives initials', () => {
    expect(initials('R. Menon')).toBe('RM');
    expect(initials('Cher')).toBe('CH');
  });

  it('title-cases and clamps', () => {
    expect(titleCase('coal production report')).toBe('Coal Production Report');
    expect(clamp(12, 0, 10)).toBe(10);
    expect(ext('report.final.PDF')).toBe('pdf');
  });
});

describe('stableStringify', () => {
  it('sorts object keys so logically equal payloads hash identically', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('handles nested structures', () => {
    expect(stableStringify({ z: [3, 1, 2], a: { y: 1, x: 2 } })).toBe('{"a":{"x":2,"y":1},"z":[3,1,2]}');
  });
});

describe('tone mappings', () => {
  it('maps statuses to tone names', () => {
    expect(statusTone('Indexed')).toBe('success');
    expect(statusTone('Failed')).toBe('error');
    expect(severityTone('critical')).toBe('error');
    expect(reportTone('Approved')).toBe('success');
    expect(reportTone('Rejected')).toBe('error');
    expect(conflictTone('Resolved')).toBe('success');
    expect(conflictTone('Unresolved')).toBe('error');
    expect(dupTone('Confirmed Duplicate')).toBe('error');
    expect(dupTone('Not Duplicate')).toBe('success');
  });
});
