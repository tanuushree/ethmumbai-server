import PDFDocument from 'pdfkit';
import path from 'path';
import { PassThrough } from 'stream';

export interface InvoiceData {
  invoiceNo?: string | null;
  date: string;
  billedTo: {
    name: string;
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    pincode: string;
  };
  item: {
    description: string;
    quantity: number;
    price: number;
  };
  discount: number;
  gstRate: number; // e.g. 18
  paymentMethod: string;
  excludingGstCost?: number;
  cgst?: number;
  sgst?: number;
}

export function generateInvoicePDF(
  data: InvoiceData,
): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const pageWidth = doc.page.width;

    const fontRegular = path.join(
      __dirname,
      "../assets/fonts/InterTight-Regular.ttf"
    );
      const fontBold = path.join(
        __dirname,
        "../assets/fonts/InterTight-Bold.ttf"
      );
  
      const fontMplus = path.join(
      __dirname,
      "../assets/fonts/MPLUSRounded1c-Black.ttf"
    );
  
  
    doc.registerFont("Regular", fontRegular);
    doc.registerFont("Bold", fontBold);
    doc.registerFont("MPlus", fontMplus);

  // Global horizontal shift (increase = move left)
  const SHIFT_LEFT = 50;

  // Right section
  const RIGHT_LABEL_X = pageWidth - 250 - SHIFT_LEFT;
  const RIGHT_VALUE_X = pageWidth - 150 - SHIFT_LEFT;
  const RIGHT_TITLE_X = pageWidth - 300 - SHIFT_LEFT;

  // Table columns
  const COL_DESC = 50 - SHIFT_LEFT;
  const COL_QTY = 350 - SHIFT_LEFT;
  const COL_PRICE = 420 - SHIFT_LEFT;
  const COL_TOTAL = 500 - SHIFT_LEFT;
  const TABLE_RIGHT_EDGE = pageWidth - 50 - SHIFT_LEFT;

  // ✅ SAFE NORMALIZATION
  const quantity = Number(data.item?.quantity ?? 1);
  // const price = Number(data.item?.price ?? 0);
  const discount = Number(data.discount ?? 0);
  // const gstRate = Number(data.gstRate ?? 0);
  // const gstPerTicket = 95.27;

  const actualTicketPrice = 2499; // INR 2,499

  /* ---------- HEADER ---------- */
  const logoPath = path.join(__dirname, '../assets/ethmumbai-logo.png');
  doc.image(logoPath, 50, 45, { width: 120 });

  doc
    .fontSize(26)
    .font('Bold')
    .text('TAX INVOICE', RIGHT_LABEL_X, 50);

  /* ---------- ISSUER DETAILS ---------- */
  doc
    .fontSize(10)
    .font('Bold')
    .text('Issued by:', RIGHT_LABEL_X, 100)
    .font('Regular')
    .text('ETHMumbai Private Limited', RIGHT_VALUE_X, 100)
    .font('Bold')
    .text('GSTIN:', RIGHT_LABEL_X, 118)
    .font('Regular')
    .text('27AAJCE3338F1ZO', RIGHT_VALUE_X, 118)
    .font('Bold')
    .text('PAN:', RIGHT_LABEL_X, 136)
    .font('Regular')
    .text('AAJCE3338F', RIGHT_VALUE_X, 136)
    .font('Bold')
    .text('Invoice No:', RIGHT_LABEL_X, 154)
    .font('Regular')
    .text(String(data.invoiceNo ?? ''), RIGHT_VALUE_X, 154)
    .font('Bold')
    .text('Date:', RIGHT_LABEL_X, 172)
    .font('Regular')
    .text(String(data.date ?? ''), RIGHT_VALUE_X, 172);


  /* ---------- BILLED TO ---------- */
  doc
   doc
  .font('Bold')
  .fontSize(11)
  .text('Billed to:', 50, 110)

  .font('Regular')
  .text(data.billedTo?.name ?? '', 50, 130)

  // Address (auto wrap)
  .text(data.billedTo?.addressLine1 ?? '', 50, 146, {
    width: 200,
  })

  // Continue without fixed Y — it will flow correctly
  .text(
    `${data.billedTo?.city ?? ''}, ${data.billedTo?.state ?? ''}`,
    50
  )

  .text(`${data.billedTo?.country ?? ''} ${data.billedTo?.pincode ?? ''}`, 50);

  /* ---------- TABLE ---------- */
  let tableTop = 240;

  doc
    .moveTo(50, tableTop)
    .lineTo(pageWidth - 50, tableTop)
    .stroke();

  doc
    .font('Regular')
    .text('DESCRIPTION', 50, tableTop + 10)
    .text('QTY', COL_QTY, tableTop + 10)
    .text('PRICE', COL_PRICE, tableTop + 10)
    .text('TOTAL', COL_TOTAL, tableTop + 10);

  doc
    .moveTo(50, tableTop + 30)
    .lineTo(pageWidth - 50, tableTop + 30)
    .stroke();

  const itemTotal = quantity * actualTicketPrice;

  doc
    .font('Regular')
    .text('ETHMumbai Conference Ticket - Regular', 50, tableTop + 45)
    .text(String(quantity), COL_QTY, tableTop + 45)
    .text(`INR ${actualTicketPrice.toLocaleString()}`, COL_PRICE, tableTop + 45)
    .text(`INR ${itemTotal.toLocaleString()}`, COL_TOTAL, tableTop + 45);

  doc
    .moveTo(50, tableTop + 80)
    .lineTo(pageWidth - 50, tableTop + 80)
    .stroke();

  /* ---------- TOTALS ---------- */
  const totalDiscount = discount * quantity;
  const discountedTotal = itemTotal - totalDiscount;


  let totalsTop = tableTop + 110;

  doc
    .font('Regular')
    .text('SUB TOTAL', COL_QTY, totalsTop)
    .text(`INR ${itemTotal.toLocaleString()}`, COL_TOTAL, totalsTop)
    .text('DISCOUNT', COL_QTY, totalsTop + 20)
    .text(`INR ${totalDiscount.toLocaleString()}`, COL_TOTAL, totalsTop + 20);

  doc
    .moveTo(COL_QTY, totalsTop + 45)
    .lineTo(TABLE_RIGHT_EDGE, totalsTop + 45)
    .stroke();

  doc
    .font('Bold')
    .text('TOTAL', COL_QTY, totalsTop + 60)
    .text(`INR ${discountedTotal.toLocaleString()}`, COL_TOTAL, totalsTop + 60);


  /* ---------- GST ---------- */
  let gstTop = totalsTop + 110;

  // ensure excludingGstCost is a number (fallback to 0 if undefined)
  const excludingGst = Number(data.excludingGstCost ?? 0);
  const totalExludingGst = excludingGst * quantity; 
  const cgst = Number(data.cgst ?? 0);
  const totalCgst = cgst * quantity;
  const sgst = Number(data.sgst ?? 0);
  const totalSgst = sgst * quantity;

  doc
    .font('Regular')
    .text('EXCLUDING GST', COL_QTY, gstTop)
    .text(`INR ${totalExludingGst.toFixed(2)}`, COL_TOTAL, gstTop)
    .text('CGST 9%', COL_QTY, gstTop + 20)
    .text(`INR ${totalCgst.toFixed(2)}`, COL_TOTAL, gstTop + 20)
    .text('SGST 9%', COL_QTY, gstTop + 40)
    .text(`INR ${totalSgst.toFixed(2)}`, COL_TOTAL, gstTop + 40);

  /* ---------- FOOTER ---------- */
  doc
    .font('Bold')
    .text('Payment Method:\n', 50, 700)
    .font('Regular')
    .text(`${data.paymentMethod ?? ''}`, 50, 720);

  const RIGHT_SECTION_X = pageWidth - 250 - SHIFT_LEFT;
  const RIGHT_SECTION_WIDTH = 200; // controls text wrapping


  doc
    .font('Bold')
    .fillColor('#000000')
    .fontSize(18)
    .text(
      'See you at the\n',
      RIGHT_SECTION_X,
      710,
      {
        width: RIGHT_SECTION_WIDTH,
        align: 'right',
      },
    );
    doc
    .font('Bold')
    .fillColor('#E11D48')
    .fontSize(18)
    .text(
      'BEST Ethereum\nConference',
      RIGHT_SECTION_X,
      730,
      {
        width: RIGHT_SECTION_WIDTH,
        align: 'right',
      },
    );


  doc.end();
  return doc;
}

export function generateInvoicePDFBuffer(
  invoiceData: InvoiceData,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = generateInvoicePDF(invoiceData);

    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}
