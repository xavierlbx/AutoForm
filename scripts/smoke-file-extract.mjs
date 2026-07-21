/**
 * One-off smoke: create fixtures and extract with real pdfjs + mammoth.
 * Run: node scripts/smoke-file-extract.mjs
 * Logs only metadata (char counts), never full document text.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.join(root, 'src', 'core', 'fixtures');
fs.mkdirSync(fixturesDir, { recursive: true });

const pdfPath = path.join(fixturesDir, 'sample.pdf');
const docxPath = path.join(fixturesDir, 'sample.docx');

const pdfSource = [
  '%PDF-1.4',
  '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
  '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
  '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj',
  '4 0 obj<< /Length 55 >>stream',
  'BT /F1 18 Tf 20 100 Td (AutoFormPDF) Tj ET',
  'endstream',
  'endobj',
  '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
  'xref',
  '0 6',
  '0000000000 65535 f ',
  '0000000009 00000 n ',
  '0000000058 00000 n ',
  '0000000115 00000 n ',
  '0000000266 00000 n ',
  '0000000371 00000 n ',
  'trailer<< /Size 6 /Root 1 0 R >>',
  'startxref',
  '450',
  '%%EOF',
  '',
].join('\n');

fs.writeFileSync(pdfPath, pdfSource);

const zip = new JSZip();
zip.file(
  '[Content_Types].xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
);
zip.folder('_rels')?.file(
  '.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
);
zip.folder('word')?.file(
  'document.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>AutoFormDOCX</w:t></w:r></w:p></w:body>
</w:document>`,
);

const docxBuffer = await zip.generateAsync({ type: 'nodebuffer' });
fs.writeFileSync(docxPath, docxBuffer);

GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(root, 'node_modules/pdfjs-dist/build/pdf.worker.mjs'),
).href;

const standardFontDataUrl = pathToFileURL(
  path.join(root, 'node_modules/pdfjs-dist/standard_fonts') + path.sep,
).href;

const pdfData = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await getDocument({
  data: pdfData,
  standardFontDataUrl,
  useSystemFonts: true,
}).promise;
const page = await pdf.getPage(1);
const content = await page.getTextContent();
const pdfText = content.items
  .map((item) => ('str' in item ? item.str : ''))
  .join(' ')
  .trim();
await pdf.cleanup();

const docxResult = await mammoth.extractRawText({ buffer: docxBuffer });
const docxText = docxResult.value.trim();

if (!pdfText.includes('AutoFormPDF')) {
  console.error('PDF smoke failed; chars=', pdfText.length);
  process.exit(1);
}
if (!docxText.includes('AutoFormDOCX')) {
  console.error('DOCX smoke failed; chars=', docxText.length);
  process.exit(1);
}

console.log('smoke ok: PDF chars=', pdfText.length, 'DOCX chars=', docxText.length);
