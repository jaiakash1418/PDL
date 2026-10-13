// Best-effort OCR for scanned images and text-less PDF pages.
// tesseract.js is loaded lazily so it never affects first paint and its absence
// cannot break the rest of the application. If OCR assets cannot be fetched,
// callers receive a clear error and must preserve the original file and mark the
// document "Partially Processed" — never fabricate extracted text.

export interface OcrOutcome {
  text: string;
  confidence?: number;
  ok: boolean;
  error?: string;
}

export interface OcrProgress {
  (status: string, progress: number): void;
}

export async function ocrImage(source: Blob | HTMLCanvasElement | string, onProgress?: OcrProgress): Promise<OcrOutcome> {
  try {
    const Tesseract = await import('tesseract.js');
    const recognize = (Tesseract as any).recognize ?? (Tesseract as any).default?.recognize;
    const result = await recognize(source as any, 'eng', {
      logger: (m: any) => {
        if (onProgress && typeof m.progress === 'number') onProgress(m.status ?? 'recognizing', m.progress);
      },
    });
    const text: string = result?.data?.text ?? '';
    return { text, confidence: result?.data?.confidence, ok: text.trim().length > 0 };
  } catch (err) {
    return {
      ok: false,
      text: '',
      error:
        err instanceof Error
          ? err.message
          : 'OCR engine unavailable (tesseract.js assets could not be loaded).',
    };
  }
}

export async function renderPdfPageToCanvas(page: any, scale = 2): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}
