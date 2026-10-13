const path = require('node:path');
const { pathToFileURL } = require('node:url');
let parserPromise;

async function pdfParser() {
  if (!parserPromise) {
    parserPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then(parser => {
      parser.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
      return parser;
    }).catch(error => { parserPromise = null; throw error; });
  }
  return parserPromise;
}

async function extractPdfText(buffer, maxCharacters = 500000) {
  const parser = await pdfParser();
  const assets = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const task = parser.getDocument({
    // Copy the bytes: PDF.js may transfer/detach the supplied typed array.
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    stopAtErrors: false,
    verbosity: 0,
    cMapUrl: path.join(assets, 'cmaps') + path.sep,
    cMapPacked: true,
    standardFontDataUrl: path.join(assets, 'standard_fonts') + path.sep
  });
  try {
    const document = await task.promise;
    let text = '';
    for (let number = 1; number <= document.numPages && text.length < maxCharacters; number += 1) {
      const page = await document.getPage(number);
      try {
        const content = await page.getTextContent();
        let previousY;
        let pageText = '';
        for (const item of content.items) {
          if (typeof item.str !== 'string') continue;
          const y = item.transform?.[5];
          if (previousY !== undefined && y !== undefined && Math.abs(previousY - y) > 2 && !pageText.endsWith('\n')) pageText += '\n';
          pageText += item.str + (item.hasEOL ? '\n' : ' ');
          previousY = y;
        }
        text += pageText.trim() + '\n\n';
      } finally { page.cleanup(); }
    }
    text = text.slice(0, maxCharacters).trim();
    if (!text) throw new Error('This PDF has no readable text. Upload a searchable PDF or a DOCX resume; scanned PDFs need OCR first.');
    return text;
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('This PDF is password protected. Save an unlocked copy and upload it.');
    if (error.name === 'InvalidPDFException' || /xref|invalid pdf|invalid page|invalid root/i.test(error.message)) {
      throw new Error('This PDF could not be recovered. Export a fresh PDF from the original document, or upload a DOCX version.');
    }
    throw error;
  } finally { await task.destroy(); }
}
module.exports = { extractPdfText };
