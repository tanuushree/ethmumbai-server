import PDFDocument from "pdfkit";
import path from "path";
import { PassThrough } from "stream";

interface TicketData {
  name: string;
  ticketId: string;
  qrImage: Buffer;
}

export function generateTicketPDF(data: TicketData): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({
    size: [375, 667],
    margins: { top: 0, left: 0, right: 0, bottom: 0 },
  });

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  const fontRegular = path.join(
    __dirname,
    "../assets/fonts/InterTight-Regular.ttf"
  );
  const fontBold = path.join(
    __dirname,
    "../assets/fonts/InterTight-Bold.ttf"
  );
  const fontMPlus = path.join(
    __dirname,
    "../assets/fonts/MPLUSRounded1c-Black.ttf"
  );

  doc.registerFont("Regular", fontRegular);
  doc.registerFont("Bold", fontBold);
  doc.registerFont("MPlus", fontMPlus);

  // Background
  doc.rect(0, 0, pageWidth, pageHeight).fill("#FFFFFF");

  // Logo
  const logoPath = path.join(__dirname, "../assets/ethmumbai-logo.png");

  const logoWidth = 160;
  const logoX = (pageWidth - logoWidth) / 2;
  const logoY = 40;

  doc.image(logoPath, logoX, logoY, { width: logoWidth });

  /**
   * Hey {name}
   */
  doc
    .font("MPlus")
    .fontSize(30)
    .fillColor("#000000")
    .text(`Hey ${data.name}`, 0, 120, { align: "center" });

  doc
    .font("Regular")
    .fontSize(16)
    .text(
      "This is your ticket to the\nETHMumbai Conference",
      0,
      170,
      { align: "center" }
    );

  /**
   * QR CODE
   */
  const qrSize = 204;
  const qrX = (pageWidth - qrSize) / 2;
  const qrY = 260;

  const qrPadding = 2; // reduced space
  const qrBorderWidth = 2;

  doc
    .roundedRect(
      qrX - qrPadding,
      qrY - qrPadding,
      qrSize + qrPadding * 2,
      qrSize + qrPadding * 2,
      12
    )
    .lineWidth(qrBorderWidth)
    .stroke("#E23B2E");

  doc.image(data.qrImage, qrX, qrY, {
    width: qrSize,
    height: qrSize,
  });

  /**
   * DETAILS
   */
  const detailY = qrY + qrSize + 36;

  doc.font("Bold").fontSize(16).text("Name", 0, detailY, { align: "center" });
  doc
    .font("Regular")
    .fontSize(16)
    .text(data.name, 0, detailY + 20, { align: "center" });

  doc
    .font("Bold")
    .fontSize(16)
    .text("Ticket ID", 0, detailY + 60, { align: "center" });
  doc
    .font("Regular")
    .fontSize(16)
    .text(data.ticketId, 0, detailY + 80, { align: "center" });

  doc
    .font("Bold")
    .fontSize(16)
    .text("Date", 0, detailY + 120, { align: "center" });
  doc
    .font("Regular")
    .fontSize(16)
    .text("12 March 2026", 0, detailY + 140, {
      align: "center",
    });

  /**
   * Extra breathing space at bottom
   */
  doc.moveDown(2);

  doc.end();
  return doc;
}

export async function generateTicketPDFBuffer(data: TicketData): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = generateTicketPDF(data);

    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));

    doc.pipe(stream);
  });
}
