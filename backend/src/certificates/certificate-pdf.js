import PDFDocument from 'pdfkit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const logoPath = fileURLToPath(
  new URL('../../../frontend/src/assets/branding/ewa_logo_wide_sticker.png', import.meta.url),
);
const ink = '#14243E';
const muted = '#52667A';
const cyan = '#087F98';
const paper = '#FFFFFF';
const date = (value) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(value),
  );

function bounded(value, max) {
  if (typeof value !== 'string') throw new TypeError('Invalid certificate text.');
  const text = Array.from(value, (character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  })
    .join('')
    .trim();
  if (!text || text.length > max) throw new TypeError('Invalid certificate text.');
  return text;
}

function fit(doc, value, { x, y, width, maxSize, minSize, maxHeight, font = 'Helvetica-Bold' }) {
  doc.font(font);
  for (let size = maxSize; size >= minSize; size--) {
    doc.fontSize(size);
    if (doc.heightOfString(value, { width, align: 'center' }) <= maxHeight) {
      doc.text(value, x, y, { width, height: maxHeight, align: 'center' });
      return;
    }
  }
  throw new RangeError('Certificate text exceeds the reserved layout area.');
}

export function renderCertificatePdf(certificate, organizationName = '') {
  const name = bounded(certificate.employeeName, 210);
  const title = bounded(certificate.trainingTitle, 200);
  const number = bounded(certificate.certificateNumber, 36);
  const organization = organizationName ? bounded(organizationName, 100) : '';
  if (!/^[0-9a-f-]{36}$/i.test(number)) throw new TypeError('Invalid certificate number.');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      info: {
        Title: 'EWAGuard AI Training Certificate',
        Author: 'EWAGuard AI',
        Subject: 'Security awareness training completion',
      },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    try {
      const W = 841.89,
        H = 595.28;
      doc.rect(0, 0, W, H).fill(paper);
      doc
        .rect(24, 24, W - 48, H - 48)
        .lineWidth(1.2)
        .strokeColor('#C9D8E1')
        .stroke();
      doc
        .rect(34, 34, W - 68, H - 68)
        .lineWidth(0.5)
        .strokeColor('#E1E9EE')
        .stroke();
      doc.rect(24, 24, W - 48, 6).fill(cyan);
      if (existsSync(logoPath)) doc.image(logoPath, 70, 54, { fit: [165, 65] });
      else doc.font('Helvetica-Bold').fontSize(18).fillColor(ink).text('EWAGuard AI', 70, 70);
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor(cyan)
        .text('SECURITY AWARENESS', 255, 72, { width: 330, align: 'center', characterSpacing: 2 });
      doc
        .font('Helvetica')
        .fontSize(13)
        .fillColor(muted)
        .text('Certificate of Completion', 180, 133, { width: 480, align: 'center' });
      doc.moveTo(329, 167).lineTo(513, 167).lineWidth(2).strokeColor(cyan).stroke();
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor(muted)
        .text('Presented to', 180, 188, { width: 480, align: 'center' });
      fit(doc, name, { x: 106, y: 214, width: 630, maxSize: 31, minSize: 10, maxHeight: 70 });
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor(muted)
        .text('for successfully completing', 180, 300, { width: 480, align: 'center' });
      fit(doc, title, { x: 116, y: 326, width: 610, maxSize: 22, minSize: 10, maxHeight: 68 });
      if (organization)
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor(muted)
          .text(organization, 140, 398, { width: 562, align: 'center', height: 30 });
      doc.moveTo(70, 446).lineTo(772, 446).lineWidth(0.7).strokeColor('#D6E2E8').stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor(ink).text('COMPLETED', 75, 463);
      doc.font('Helvetica').fontSize(12).fillColor(ink).text(date(certificate.completedAt), 75, 479);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(ink).text('ISSUED', 265, 463);
      doc.font('Helvetica').fontSize(12).fillColor(ink).text(date(certificate.issuedAt), 265, 479);
      if (certificate.scorePercent !== null && certificate.scorePercent !== undefined) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor(ink).text('COURSE QUIZ SCORE', 455, 463);
        doc
          .font('Helvetica')
          .fontSize(12)
          .fillColor(ink)
          .text(`${Number(certificate.scorePercent)}%`, 455, 479);
      }
      doc.font('Helvetica-Bold').fontSize(9).fillColor(ink).text('CERTIFICATE NUMBER', 75, 521);
      doc.font('Helvetica').fontSize(10).fillColor(muted).text(number, 75, 537, { width: 420 });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(muted)
        .text('Verify within EWAGuard AI', 585, 535, { width: 180, align: 'right' });
      doc.end();
    } catch (error) {
      doc.destroy(error);
      reject(error);
    }
  });
}
