declare module 'mammoth/mammoth.browser' {
  const mammoth: any;
  export default mammoth;
  export const extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string; messages: any[] }>;
}

declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const url: string;
  export default url;
}
