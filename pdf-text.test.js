const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extractPdfText } = require('./pdf-text');

function resumePdf({ blank = false, badRootOffset = false, badStartXref = false } = {}) {
  const stream = blank ? '' : 'BT /F1 12 Tf 72 720 Td (Jane Candidate) Tj 0 -20 Td (Software engineer with five years of experience.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let file = '%PDF-1.7\n'; const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(file)); file += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(file);
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index++) {
    const offset = badRootOffset && index === 1 ? 999999 : offsets[index];
    file += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${badStartXref ? 999999 : xref}\n%%EOF\n`;
  return Buffer.from(file);
}

test('PDF resumes extract readable text and preserve line boundaries', async () => {
  const bytes = resumePdf();
  const text = await extractPdfText(bytes);
  assert.match(text, /Jane Candidate\s*\nSoftware engineer/);
  assert.match(text, /five years of experience/);
  assert.equal(bytes.subarray(0, 8).toString(), '%PDF-1.7');
});
test('PDF resumes recover malformed cross-reference entries and startxref pointers', async () => {
  for (const options of [{ badRootOffset: true }, { badStartXref: true }]) {
    assert.match(await extractPdfText(resumePdf(options)), /Jane Candidate/);
  }
});
test('empty scanned PDFs and corrupt files return actionable upload errors', async () => {
  await assert.rejects(extractPdfText(resumePdf({ blank: true })), /searchable PDF or a DOCX resume/);
  await assert.rejects(extractPdfText(Buffer.from('not a PDF')), /Export a fresh PDF/);
});
test('PDF extraction caps retained resume text', async () => {
  const text = await extractPdfText(resumePdf(), 25);
  assert.ok(text.length <= 25);
  assert.match(text, /Jane Candidate/);
});
module.exports = { resumePdf };
