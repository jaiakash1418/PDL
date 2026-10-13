import type { SourceRef } from './types';

// Deep-links into the document viewer. `page` scrolls to and focuses the page;
// `highlight` marks the exact cited snippet within that page's extracted text.
export function docLink(docId: string, pageNo?: number, highlight?: string): string {
  const params = new URLSearchParams();
  if (pageNo && pageNo > 0) params.set('page', String(pageNo));
  const h = highlight?.trim();
  if (h) params.set('highlight', h);
  const qs = params.toString();
  return `/app/documents/${docId}${qs ? `?${qs}` : ''}`;
}

export function sourceLink(ref: Pick<SourceRef, 'docId' | 'pageNo' | 'snippet'>): string {
  return docLink(ref.docId, ref.pageNo, ref.snippet);
}
