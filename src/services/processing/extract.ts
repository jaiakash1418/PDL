// Client-side document extraction. Every extractor is real and works offline;
// none of them fabricates content. When a format cannot be fully processed the
// caller records an explicit warning in the document processing log.

import { tokenize } from '../../lib/text';

export interface ExtractedPage {
  pageNo: number;
  text: string;
  section?: string;
}

export interface ExtractedTable {
  pageNo: number;
  title?: string;
  headers: string[];
  rows: string[][];
}

export interface ExtractResult {
  pages: ExtractedPage[];
  tables: ExtractedTable[];
  pageCount: number;
  sheetCount?: number;
  ocrUsed: boolean;
  warnings: string[];
  /** true when the format is image-only or produced no text layer */
  needsOcr: boolean;
  kind: 'pdf' | 'docx' | 'sheet' | 'text' | 'image' | 'unknown';
}

const PDF = 'pdf';
const DOCX = 'docx';
const SHEET = 'sheet';
const TEXT = 'text';
const IMAGE = 'image';

export function classify(fileName: string, mime: string): ExtractResult['kind'] {
  const e = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (e === 'pdf' || mime === 'application/pdf') return PDF;
  if (e === 'docx' || mime.includes('wordprocessingml')) return DOCX;
  if (['xlsx', 'xls', 'csv'].includes(e) || mime.includes('spreadsheet') || mime.includes('csv')) return SHEET;
  if (['txt', 'md', 'log'].includes(e) || mime.startsWith('text/')) return TEXT;
  if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'].includes(e) || mime.startsWith('image/')) return IMAGE;
  return 'unknown';
}

export async function extractFile(file: File): Promise<ExtractResult> {
  const kind = classify(file.name, file.type);
  switch (kind) {
    case PDF: return extractPdf(file);
    case DOCX: return extractDocx(file);
    case SHEET: return extractSheet(file);
    case TEXT: return extractText(file);
    case IMAGE: return extractImage(file);
    default:
      return {
        pages: [], tables: [], pageCount: 0, ocrUsed: false, needsOcr: false, kind: 'unknown',
        warnings: [`Unsupported file type for extraction: ${file.name}. The original file is retained but not indexed.`],
      };
  }
}

// --- PDF ------------------------------------------------------------------

async function extractPdf(file: File): Promise<ExtractResult> {
  const warnings: string[] = [];
  try {
    const pdfjs: any = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
    const pages: ExtractedPage[] = [];
    let section = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const lineMap = new Map<number, string[]>();
      for (const item of content.items as any[]) {
        const str: string = item.str ?? '';
        if (!str) continue;
        const y = Math.round(item.transform?.[5] ?? 0);
        const arr = lineMap.get(y) ?? [];
        arr.push(str);
        lineMap.set(y, arr);
      }
      const lines = [...lineMap.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) => parts.join(' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      let text = lines.join('\n');
      const detected = detectSection(lines);
      if (detected) section = detected;
      pages.push({ pageNo: i, text, section: section || undefined });
    }
    const totalText = pages.reduce((n, p) => n + p.text.trim().length, 0);
    const needsOcr = totalText < 20;
    if (needsOcr) warnings.push('The PDF appears to have no extractable text layer (likely a scan). OCR can be run from the document detail page.');
    return { pages, tables: [], pageCount: doc.numPages, ocrUsed: false, warnings, needsOcr, kind: PDF };
  } catch (err) {
    return {
      pages: [], tables: [], pageCount: 0, ocrUsed: false, needsOcr: true, kind: PDF,
      warnings: [`PDF parsing failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

async function ocrPdfPages(file: File, maxPages = 5): Promise<ExtractResult> {
  const { ocrImage, renderPdfPageToCanvas } = await import('./ocr');
  const warnings: string[] = [];
  const pages: ExtractedPage[] = [];
  try {
    const pdfjs: any = await import('pdfjs-dist');
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const n = Math.min(doc.numPages, maxPages);
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const canvas = await renderPdfPageToCanvas(page, 2);
      const res = await ocrImage(canvas);
      if (res.ok) pages.push({ pageNo: i, text: res.text });
      else warnings.push(`OCR failed on page ${i}: ${res.error ?? 'no text detected'}`);
    }
    if (doc.numPages > maxPages) warnings.push(`OCR limited to the first ${maxPages} pages of ${doc.numPages} for performance.`);
    return { pages, tables: [], pageCount: doc.numPages, ocrUsed: true, warnings, needsOcr: false, kind: PDF };
  } catch (err) {
    return { pages, tables: [], pageCount: 0, ocrUsed: true, needsOcr: false, kind: PDF, warnings: [`OCR processing failed: ${err instanceof Error ? err.message : String(err)}`] };
  }
}

export async function runOcr(file: File): Promise<ExtractResult> {
  const kind = classify(file.name, file.type);
  if (kind === PDF) return ocrPdfPages(file);
  if (kind === IMAGE) return extractImage(file);
  return extractFile(file);
}

// --- DOCX -----------------------------------------------------------------

async function extractDocx(file: File): Promise<ExtractResult> {
  const warnings: string[] = [];
  try {
    const mammoth: any = await import('mammoth/mammoth.browser');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const raw: string = result?.value ?? '';
    if (result?.messages?.length) {
      for (const m of result.messages) if (m.type === 'warning') warnings.push(m.message);
    }
    const paragraphs = raw.split(/\n{2,}/).map((p: string) => p.trim()).filter(Boolean);
    // Approximate pagination (DOCX has no fixed pages): ~6 paragraphs or 2600 chars per page.
    const pages: ExtractedPage[] = [];
    let buffer: string[] = [];
    let len = 0;
    let pageNo = 1;
    let section = '';
    const flush = () => {
      if (buffer.length === 0) return;
      const text = buffer.join('\n\n');
      pages.push({ pageNo, text, section: section || undefined });
      buffer = [];
      len = 0;
      pageNo++;
    };
    for (const para of paragraphs) {
      const det = detectSection(para.split('\n'));
      if (det) { section = det; flush(); }
      buffer.push(para);
      len += para.length;
      if (buffer.length >= 6 || len >= 2600) flush();
    }
    flush();
    if (pages.length === 0) warnings.push('No text content found in the DOCX file.');
    warnings.push('DOCX documents have no fixed page layout; page boundaries are approximated for citation purposes.');
    return { pages, tables: [], pageCount: pages.length, ocrUsed: false, warnings, needsOcr: false, kind: DOCX };
  } catch (err) {
    return {
      pages: [], tables: [], pageCount: 0, ocrUsed: false, needsOcr: false, kind: DOCX,
      warnings: [`DOCX parsing failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

// --- Spreadsheets & CSV ---------------------------------------------------

async function extractSheet(file: File): Promise<ExtractResult> {
  const warnings: string[] = [];
  try {
    const XLSX: any = await import('xlsx');
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array', cellDates: true });
    const pages: ExtractedPage[] = [];
    const tables: ExtractedTable[] = [];
    wb.SheetNames.forEach((name: string, idx: number) => {
      const ws = wb.Sheets[name];
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      const clean = aoa.map((r) => r.map((c) => (c == null ? '' : String(c)))).filter((r) => r.some((c) => c !== ''));
      if (clean.length === 0) return;
      const headers = clean[0].map((h, i) => h || `Column ${i + 1}`);
      const rows = clean.slice(1);
      const pageNo = idx + 1;
      tables.push({ pageNo, title: name, headers, rows });
      const headerLine = `${name}: ${headers.join(' | ')}`;
      const body = rows.slice(0, 400).map((r) => r.join(' | ')).join('\n');
      pages.push({ pageNo, text: `${headerLine}\n${body}`, section: name });
    });
    if (tables.length === 0) warnings.push('The spreadsheet contained no readable rows.');
    return { pages, tables, pageCount: pages.length, sheetCount: wb.SheetNames.length, ocrUsed: false, warnings, needsOcr: false, kind: SHEET };
  } catch (err) {
    return {
      pages: [], tables: [], pageCount: 0, ocrUsed: false, needsOcr: false, kind: SHEET,
      warnings: [`Spreadsheet parsing failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
}

// --- Plain text -----------------------------------------------------------

async function extractText(file: File): Promise<ExtractResult> {
  const warnings: string[] = [];
  try {
    const text = await file.text();
    const paragraphs = text.split(/\n{2,}/);
    const pages: ExtractedPage[] = [];
    let buffer: string[] = [];
    let len = 0;
    let pageNo = 1;
    const flush = () => { if (buffer.length) { pages.push({ pageNo, text: buffer.join('\n\n') }); buffer = []; len = 0; pageNo++; } };
    for (const p of paragraphs) {
      buffer.push(p.trim());
      len += p.length;
      if (len >= 2600) flush();
    }
    flush();
    return { pages, tables: [], pageCount: pages.length, ocrUsed: false, warnings, needsOcr: false, kind: TEXT };
  } catch (err) {
    return { pages: [], tables: [], pageCount: 0, ocrUsed: false, needsOcr: false, kind: TEXT, warnings: [`Text parsing failed: ${err instanceof Error ? err.message : String(err)}`] };
  }
}

// --- Images ---------------------------------------------------------------

async function extractImage(file: File): Promise<ExtractResult> {
  const { ocrImage } = await import('./ocr');
  const warnings: string[] = [];
  const res = await ocrImage(file);
  if (!res.ok) {
    warnings.push(res.error ? `OCR failed: ${res.error}` : 'No readable text detected in the image.');
    return { pages: [], tables: [], pageCount: 1, ocrUsed: true, warnings, needsOcr: true, kind: IMAGE };
  }
  return {
    pages: [{ pageNo: 1, text: res.text }],
    tables: [], pageCount: 1, ocrUsed: true, warnings, needsOcr: false, kind: IMAGE,
  };
}

// --- Section detection ----------------------------------------------------

const SECTION_PATTERNS = [
  /^(chapter|section|part|annexure|annex|appendix)\s+[\dIVXLC]+/i,
  /^\d+(\.\d+)*\.?\s+[A-Z][A-Za-z]/,
  /^[A-Z][A-Z0-9 ,&()\-/]{6,}$/,
];

function detectSection(lines: string[]): string | undefined {
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.length > 90) continue;
    for (const re of SECTION_PATTERNS) {
      if (re.test(line)) return line.replace(/[:.]$/, '').trim();
    }
  }
  return undefined;
}

export function tokenCount(text: string): number {
  return tokenize(text).length;
}
