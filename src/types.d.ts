declare module 'pdf-parse' {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }

  function pdf(dataBuffer: Buffer): Promise<PDFData>;
  export = pdf;
}

declare module 'mammoth' {
  interface Message {
    type: string;
    message: string;
  }

  interface Result {
    value: string;
    messages: Message[];
  }

  export function extractRawText(options: { path?: string; buffer?: Buffer }): Promise<Result>;
}
