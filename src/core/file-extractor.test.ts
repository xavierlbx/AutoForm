import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocumentMock, extractRawTextMock, workerSrcSetter } = vi.hoisted(
  () => {
    const workerSrcSetter = vi.fn();
    return {
      getDocumentMock: vi.fn(),
      extractRawTextMock: vi.fn(),
      workerSrcSetter,
    };
  },
);

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/mock-pdf.worker.min.mjs',
}));

vi.mock('pdfjs-dist', () => ({
  getDocument: getDocumentMock,
  GlobalWorkerOptions: {
    set workerSrc(value: string) {
      workerSrcSetter(value);
    },
    get workerSrc() {
      return '/mock-pdf.worker.min.mjs';
    },
  },
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: extractRawTextMock,
  },
}));

import {
  extractText,
  extractTextFromDocx,
  extractTextFromPdf,
  htmlToPlainText,
} from './file-extractor';

function makeFile(
  name: string,
  type: string,
  content = new ArrayBuffer(8),
): File {
  return new File([content], name, { type });
}

describe('htmlToPlainText', () => {
  it('strips tags and decodes common entities', () => {
    expect(htmlToPlainText('<p>Olá&nbsp;<b>mundo</b>&amp; cia</p>')).toBe(
      'Olá mundo & cia',
    );
  });
});

describe('extractText dispatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDocumentMock.mockReset();
    extractRawTextMock.mockReset();
  });

  it('routes .pdf by extension to pdf extractor', async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn(async () => ({
          getTextContent: async () => ({ items: [{ str: 'Curriculo PDF' }] }),
        })),
        cleanup: vi.fn(async () => undefined),
      }),
    });

    const text = await extractText(makeFile('cv.pdf', ''));
    expect(text).toBe('Curriculo PDF');
    expect(getDocumentMock).toHaveBeenCalledOnce();
    expect(extractRawTextMock).not.toHaveBeenCalled();
    expect(workerSrcSetter).toHaveBeenCalledWith('/mock-pdf.worker.min.mjs');
  });

  it('routes application/pdf by MIME when extension is missing', async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn(async () => ({
          getTextContent: async () => ({ items: [{ str: 'via mime' }] }),
        })),
        cleanup: vi.fn(async () => undefined),
      }),
    });

    const text = await extractText(makeFile('arquivo', 'application/pdf'));
    expect(text).toBe('via mime');
  });

  it('routes .docx by extension to mammoth', async () => {
    extractRawTextMock.mockResolvedValue({ value: 'Texto do Word' });

    const text = await extractText(
      makeFile(
        'bio.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    );
    expect(text).toBe('Texto do Word');
    expect(extractRawTextMock).toHaveBeenCalledOnce();
    expect(getDocumentMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported types with a Portuguese message', async () => {
    await expect(extractText(makeFile('notes.txt', 'text/plain'))).rejects.toThrow(
      /não suportado/i,
    );
  });
});

describe('extractTextFromPdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDocumentMock.mockReset();
  });

  it('joins text from multiple pages', async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn(async (n: number) => ({
          getTextContent: async () => ({
            items: [{ str: n === 1 ? 'Pagina um' : 'Pagina dois' }],
          }),
        })),
        cleanup: vi.fn(async () => undefined),
      }),
    });

    const text = await extractTextFromPdf(new ArrayBuffer(4));
    expect(text).toBe('Pagina um\n\nPagina dois');
  });

  it('throws when PDF has no extractable text', async () => {
    getDocumentMock.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn(async () => ({
          getTextContent: async () => ({ items: [] }),
        })),
        cleanup: vi.fn(async () => undefined),
      }),
    });

    await expect(extractTextFromPdf(new ArrayBuffer(4))).rejects.toThrow(
      /só com imagens/i,
    );
  });

  it('wraps corrupt PDF errors in a user-facing message', async () => {
    const rejected = Promise.reject(new Error('Invalid PDF structure'));
    // Prevent unhandled-rejection noise before extractTextFromPdf awaits it.
    rejected.catch(() => undefined);
    getDocumentMock.mockReturnValue({ promise: rejected });

    await expect(extractTextFromPdf(new ArrayBuffer(4))).rejects.toThrow(
      /Não foi possível ler o PDF/i,
    );
  });
});

describe('extractTextFromDocx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    extractRawTextMock.mockReset();
  });

  it('returns plain text from mammoth', async () => {
    extractRawTextMock.mockResolvedValue({ value: '  Bio em texto  ' });
    await expect(extractTextFromDocx(new ArrayBuffer(4))).resolves.toBe(
      'Bio em texto',
    );
  });

  it('strips HTML if mammoth returns markup', async () => {
    extractRawTextMock.mockResolvedValue({
      value: '<p>Nome: <strong>Ana</strong></p>',
    });
    await expect(extractTextFromDocx(new ArrayBuffer(4))).resolves.toBe(
      'Nome: Ana',
    );
  });

  it('throws when extraction yields empty text', async () => {
    extractRawTextMock.mockResolvedValue({ value: '   ' });
    await expect(extractTextFromDocx(new ArrayBuffer(4))).rejects.toThrow(
      /Não foi possível extrair texto deste documento Word/i,
    );
  });

  it('wraps mammoth failures in a user-facing message', async () => {
    extractRawTextMock.mockRejectedValue(new Error('Could not find file'));
    await expect(extractTextFromDocx(new ArrayBuffer(4))).rejects.toThrow(
      /Não foi possível ler o documento Word/i,
    );
  });
});
