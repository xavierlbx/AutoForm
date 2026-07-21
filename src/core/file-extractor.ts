/**
 * Client-side PDF/DOCX text extraction (popup / extension pages only).
 *
 * pdf.js worker: loaded via Vite `?url` dynamic import and assigned to
 * `GlobalWorkerOptions.workerSrc`. `build.assetsInlineLimit: 0` keeps it as a
 * real file under `dist/assets/` (not a `data:` URL), which Chrome extension CSP
 * allows. Never point workerSrc at a CDN — that would violate MV3 rules.
 *
 * pdfjs-dist and mammoth are dynamic-imported so the popup stays small until
 * the user uploads a file (Phase 7).
 */

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const ERR_UNSUPPORTED =
  'Formato de arquivo não suportado. Use PDF (.pdf) ou Word (.docx).';
const ERR_PDF =
  'Não foi possível ler o PDF. Verifique se o arquivo não está corrompido ou protegido por senha.';
const ERR_PDF_EMPTY =
  'Não foi possível extrair texto deste PDF (pode ser um PDF só com imagens).';
const ERR_DOCX =
  'Não foi possível ler o documento Word. Verifique se o arquivo .docx não está corrompido.';
const ERR_DOCX_EMPTY = 'Não foi possível extrair texto deste documento Word.';

let pdfWorkerConfigured = false;

async function ensurePdfWorker(): Promise<typeof import('pdfjs-dist')> {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfWorkerConfigured) {
    const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
    pdfWorkerConfigured = true;
  }
  return pdfjs;
}

async function toArrayBuffer(input: File | ArrayBuffer): Promise<ArrayBuffer> {
  if (input instanceof ArrayBuffer) {
    return input;
  }
  return input.arrayBuffer();
}

/** Collapse HTML (if any) to plain text for safe later DOM insertion via textContent. */
export function htmlToPlainText(html: string): string {
  const withoutTags = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  return withoutTags.replace(/\s+/g, ' ').trim();
}

function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.pdf') || file.type === PDF_MIME;
}

function isDocxFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.docx') || file.type === DOCX_MIME;
}

/**
 * Extract text from a PDF (File or ArrayBuffer).
 * Returns plain text only — never HTML.
 */
export async function extractTextFromPdf(
  input: File | ArrayBuffer,
): Promise<string> {
  try {
    const { getDocument } = await ensurePdfWorker();
    const data = new Uint8Array(await toArrayBuffer(input));
    const loadingTask = getDocument({
      data,
      // Browser default is true; keep explicit for clearer extension behavior.
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    const pageTexts: string[] = [];

    try {
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const line = content.items
          .map((item) => ('str' in item ? String(item.str) : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (line) {
          pageTexts.push(line);
        }
      }
    } finally {
      await pdf.cleanup();
    }

    const text = pageTexts.join('\n\n').trim();
    if (!text) {
      throw new Error(ERR_PDF_EMPTY);
    }
    return text;
  } catch (error) {
    if (error instanceof Error && error.message === ERR_PDF_EMPTY) {
      throw error;
    }
    throw new Error(ERR_PDF);
  }
}

/**
 * Extract text from a DOCX (File or ArrayBuffer) via mammoth.
 * Uses extractRawText; strips HTML if a HTML-looking string slips through.
 */
export async function extractTextFromDocx(
  input: File | ArrayBuffer,
): Promise<string> {
  try {
    const mammoth = (await import('mammoth')).default;
    const arrayBuffer = await toArrayBuffer(input);
    const result = await mammoth.extractRawText({ arrayBuffer });
    let text = (result.value ?? '').trim();

    if (text.includes('<') && /<\/?[a-z][\s\S]*>/i.test(text)) {
      text = htmlToPlainText(text);
    }

    if (!text) {
      throw new Error(ERR_DOCX_EMPTY);
    }
    return text;
  } catch (error) {
    if (error instanceof Error && error.message === ERR_DOCX_EMPTY) {
      throw error;
    }
    throw new Error(ERR_DOCX);
  }
}

/** Route by extension / MIME to the correct extractor. */
export async function extractText(file: File): Promise<string> {
  if (isPdfFile(file)) {
    return extractTextFromPdf(file);
  }
  if (isDocxFile(file)) {
    return extractTextFromDocx(file);
  }
  throw new Error(ERR_UNSUPPORTED);
}
