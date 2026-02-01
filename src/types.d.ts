declare module 'pdf-parse' {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: any;
    metadata: any;
    text: string;
    version: string;
  }

  function pdf(dataBuffer: Buffer): Promise<PDFData>;
  export = pdf;
}

declare module 'mammoth' {
  interface Result {
    value: string;
    messages: any[];
  }

  export function extractRawText(options: { path?: string; buffer?: Buffer }): Promise<Result>;
}
