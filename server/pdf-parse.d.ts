declare module 'pdf-parse' {
  function parsePdf(data: Buffer, options?: unknown): Promise<{ text: string; numpages: number }>;
  export default parsePdf;
}
