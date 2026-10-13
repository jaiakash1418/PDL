import { describe, expect, it } from 'vitest';
import {
  tokenize, keywords, TfIdfIndex, jaccard, cosineOnTokens, similarityPercent,
  extractMeasurements, splitSentences, bestSnippet,
} from '../lib/text';

describe('tokenize', () => {
  it('lowercases, strips punctuation and removes stop words', () => {
    const out = tokenize('The Production of 1,200 tonnes of Coal was reported.');
    expect(out).toContain('production');
    expect(out).toContain('tonnes');
    expect(out).toContain('coal');
    expect(out).not.toContain('the');
    expect(out).not.toContain('was');
  });

  it('keeps numeric tokens', () => {
    expect(tokenize('shaft depth 450')).toContain('450');
  });
});

describe('keywords', () => {
  it('returns the most frequent terms first', () => {
    const k = keywords('coal coal coal seam seam geology', 3);
    expect(k[0]).toBe('coal');
    expect(k[1]).toBe('seam');
  });
});

describe('TfIdfIndex', () => {
  it('ranks the document that actually matches the query first', () => {
    const idx = new TfIdfIndex();
    idx.add({ id: 'a', tokens: tokenize('quarterly coal production tonnes for the underground mine'), meta: { doc: 'Production Report' } });
    idx.add({ id: 'b', tokens: tokenize('safety observation incident near the conveyor belt'), meta: { doc: 'Safety Observation' } });
    idx.add({ id: 'c', tokens: tokenize('administrative memo about office supplies'), meta: { doc: 'Administrative' } });

    const results = idx.search('coal production tonnes');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('a');
    expect(results[0].terms).toContain('coal');
  });

  it('returns nothing for an empty query or empty index', () => {
    const idx = new TfIdfIndex();
    expect(idx.search('coal')).toEqual([]);
    idx.add({ id: 'a', tokens: tokenize('coal seam'), meta: {} });
    expect(idx.search('   ')).toEqual([]);
  });

  it('replacing a document by id keeps the size stable', () => {
    const idx = new TfIdfIndex();
    idx.add({ id: 'a', tokens: tokenize('coal'), meta: {} });
    idx.add({ id: 'a', tokens: tokenize('coal geology'), meta: {} });
    expect(idx.size).toBe(1);
  });
});

describe('similarity', () => {
  it('identical text scores 100%', () => {
    expect(similarityPercent('coal production report', 'coal production report')).toBe(100);
  });

  it('overlapping text scores higher than unrelated text', () => {
    const close = similarityPercent('monthly coal production tonnes', 'monthly coal output tonnes');
    const far = similarityPercent('monthly coal production tonnes', 'staff canteen supplies order');
    expect(close).toBeGreaterThan(far);
  });

  it('jaccard and cosine handle empty input', () => {
    expect(jaccard(new Set(), new Set())).toBe(1);
    expect(cosineOnTokens([], ['coal'])).toBe(0);
  });
});

describe('extractMeasurements', () => {
  it('parses values with units and de-duplicates thousands separators', () => {
    const m = extractMeasurements('Output reached 1,250 tonnes and grade was 62 percent.');
    expect(m.length).toBe(2);
    expect(m[0].value).toBe(1250);
    expect(m[0].unit).toBe('tonnes');
    expect(m[1].value).toBe(62);
  });
});

describe('splitSentences / bestSnippet', () => {
  it('splits on sentence boundaries', () => {
    const s = splitSentences('First sentence. Second sentence! Third?');
    expect(s.length).toBe(3);
  });

  it('chooses the sentence most relevant to the query', () => {
    const text = 'The canteen menu changed. Coal despatch rose to 900 tonnes this month. Office supplies were ordered.';
    const snippet = bestSnippet(text, 'coal tonnes despatch');
    expect(snippet).toContain('900 tonnes');
  });
});
