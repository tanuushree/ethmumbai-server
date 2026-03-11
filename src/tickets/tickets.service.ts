// tickets.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as QRCode from 'qrcode';
import { MailService } from '../mail/mail.service';
import * as crypto from 'crypto';
import { generateTicketPDFBuffer } from './generateTicket';
import {
  getPngBufferFromDataUrl,
  savePngFromDataUrl,
} from 'src/utils/handle-png';
import { generateInvoicePDFBuffer } from 'src/utils/generateInvoicePdf';
import { generateInvoiceNumberForOrder } from 'src/utils/ticket.utils';
import { InvoiceData } from '../utils/generateInvoicePdf';
import Razorpay from 'razorpay';
import { getDiscount } from 'src/utils/discount';
import { Response } from 'express';
import { createCanvas, loadImage, registerFont } from 'canvas';
import path from 'path';
import JSZip from 'jszip';
import sharp from 'sharp';
@Injectable()
export class TicketsService {
  // private razorpay: ;
  private razorpay: Razorpay;
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  private async generateTicketCode(): Promise<string> {
    while (true) {
      const code = crypto
        .randomBytes(4)
        .toString('hex')
        .substring(0, 6)
        .toUpperCase();

      const exists = await this.prisma.generatedTicket.findUnique({
        where: { ticketCode: code },
      });

      if (!exists) return code;
    }
  }

  async markMerch (token:string){

    
    
    await this.prisma.generatedTicket.update({
      where: { ticketCode: token, merchReceived: false },
      data: { merchReceived: true },
    });

  }

  async generateTicketsForOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { participants: true, ticket: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    const ticketQty = order.participants.length;

    const ticket = await this.prisma.ticket.findFirst({
      where: {
        isActive: true,
        remainingQuantity: { gt: 0 },
      },
      orderBy: { priority: 'asc' },
    });

    if (!ticket?.remainingQuantity) {
      throw new BadRequestException('Tickets sold out');
    }

    if (!ticket || ticket.remainingQuantity < ticketQty) {
      throw new BadRequestException('Tickets sold out');
    }

    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        remainingQuantity: {
          decrement: ticketQty,
        },
      },
    });

    const pdfMap = new Map<string, Buffer>();
    const pngMap = new Map<string, Buffer>();

    await Promise.all(
      order.participants.map(async (participant) => {
        const ticketCode = await this.generateTicketCode();

        const { ticketUrl, qrHash } =
          await this.generateQRforTicket(ticketCode);

        await this.prisma.generatedTicket.create({
          data: {
            ticketCode,
            participantId: participant.id,
            qrHash,
            qrUrl: ticketUrl,
            orderId: order.id,
          },
        });

        // QR AS BUFFER ONLY
        const qrImageBuffer = await QRCode.toBuffer(ticketUrl, {
          width: 220,
          errorCorrectionLevel: 'M',
        });

        // PDF BUFFER
        const pdfBuffer = await generateTicketPDFBuffer({
          name: participant.firstName || 'Participant',
          ticketId: ticketCode,
          qrImage: qrImageBuffer,
        });

        pdfMap.set(ticketCode, pdfBuffer);

        const ticketType = order?.ticket?.type ?? 'regular';
        this.logger.log(`Ticket type: ${ticketType}`);

        const pngBuffer = await this.visualTicketGeneration(
          ticketType,
          participant.firstName || 'Participant',
        );

        pngMap.set(ticketCode || 'Participant', pngBuffer);
        // convert dataURL → PNG file (example path)
        // const filePath = `./qr/tickets/${ticketCode}.png`;

        // Get PNG buffer for QR image
        // getPngBufferFromDataUrl(dataUrl);

        //save QR as PNG
        // savePngFromDataUrl(dataUrl, filePath);

        //for validation in dev with x-scanner-key
        console.log(ticketUrl);
      }),
    );

    const pdfBufferInvoice = await this.generateInvoiceForOrder(orderId);

    // SEND ALL PARTICIPANT PDFs
    await this.mailService.sendParticipantEmails(orderId, pdfMap, pngMap);

    // SEND BUYER CONFIRMATION
    if (order.paymentType === 'RAZORPAY') {
      await this.mailService.sendBuyerEmail(orderId, pdfBufferInvoice);
    } else {
      await this.mailService.sendBuyerCryptoEmail(orderId);
    }

    // await this.prisma.ticket.update({
    //   where: { id: order.ticketId },
    //   data: {
    //     quantity: { decrement: order.participants.length },
    //   },
    // });
  }

  async generateQRforTicket(ticketCode: string) {
    const qrHash = crypto.createHash('sha256').update(ticketCode).digest('hex');

    const ticketUrl = `${process.env.APP_BASE_URL || 'https://www.ethmumbai.in'
      }/t/${ticketCode}`;

    return { ticketUrl, qrHash };
  }

  async getOrderStatusByUsers(users: { email: string }[]) {
    if (!users?.length) {
      throw new BadRequestException('User list is required');
    }

    const emails = users.map((u) => u.email);

    const orders = await this.prisma.order.findMany({
      where: {
        OR: [
          {
            participants: {
              some: {
                email: { in: emails },
              },
            },
          },
          {
            buyer: {
              email: { in: emails },
            },
          },
        ],
      },
      select: {
        id: true,
        status: true,
        paymentVerified: true,
        paymentType: true,
        amount: true,
        currency: true,
        createdAt: true,

        buyer: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          },
        },

        participants: {
          where: {
            email: { in: emails },
          },
          select: {
            email: true,
            firstName: true,
            lastName: true,
            emailSent: true,
            generatedTicket: {
              select: {
                ticketCode: true,
                checkedIn: true,
              },
            },
          },
        },
      },
    });

    return {
      inputCount: users.length,
      matchedOrders: orders.length,
      orders,
    };
  }

  async generateAndSendTicketForParticipant(input: {
    firstName?: string;
    email: string;
  }) {
    const { firstName, email } = input;

    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const pdfMap = new Map<string, Buffer>();

    // 1. Generate ticket code
    const ticketCode = await this.generateTicketCode();

    // 2. Generate QR
    const { ticketUrl, qrHash } = await this.generateQRforTicket(ticketCode);

    // 3. Generate QR image buffer
    const qrImageBuffer = await QRCode.toBuffer(ticketUrl, {
      width: 220,
      errorCorrectionLevel: 'M',
    });

    // 4. Generate PDF buffer
    const pdfBuffer = await generateTicketPDFBuffer({
      name: firstName || 'Participant',
      ticketId: ticketCode,
      qrImage: qrImageBuffer,
    });

    // 5. Store in pdfMap
    pdfMap.set(ticketCode, pdfBuffer);

    // 6. Send email (NO DB CHECKS / UPDATES)
    await this.mailService.sendSingleParticipantEmail(
      {
        firstName,
        email,
        ticketCode,
      },
      pdfMap,
    );

    return {
      status: 'SUCCESS',
      email,
      ticketCode,
      ticketUrl,
      qrHash,
    };
  }

  async verifyAndMark(token: string, checkedInBy: string) {
    if (!token) throw new BadRequestException('token required');

    const qrHash = crypto.createHash('sha256').update(token).digest('hex');

    const ticket = await this.prisma.generatedTicket.findFirst({
      where: { qrHash },
      include: { participant: true,  order: { include: { buyer: true, ticket: true } } },
    });

    if (!ticket) throw new NotFoundException('Ticket not found');

    if (ticket.checkedIn) {
      return { ok: true, reason: 'checkedIn', participantName: ticket.participant.firstName, ticketTypeTitle: ticket.order.ticket.title || 'Ticket',
        buyerName: ticket.order.buyer.firstName || 'Buyer', merchReceived: ticket.merchReceived };
    }

    const result = await this.prisma.generatedTicket.update({
      where: { qrHash, checkedIn: false },
      data: { checkedIn: true, checkedInAt: new Date(), checkedInBy: checkedInBy },
    });

    if (result) {
      //get ticket type and buyer info
      const orderInfo = await this.prisma.order.findFirst({
        where: { id: result.orderId },
        include: {
          buyer: true,
        },
      });
      const ticketType = await this.prisma.ticket.findFirst({
        where: { id: orderInfo?.ticketId },
      });
      // get participant info
      const p = await this.prisma.participant.findFirst({
        where: { id: result.participantId },
      });
      if (!p) throw new NotFoundException('Invalid token');
      return {
        participantName: p?.firstName || 'Participant',
        ticketTypeTitle: ticketType?.title || 'Ticket',
        buyerName: orderInfo?.buyer.firstName || 'Buyer',
      };
    }
  }

  async visualTicketGeneration(ticketType: string | null, firstName: string) {
    if (!firstName) {
      throw new BadRequestException('Missing firstName (f) parameter');
    }

    const fontPath = path.join(
      __dirname,
      '../assets/fonts/MPLUSRounded1c-ExtraBold.ttf',
    );

    registerFont(fontPath, {
      family: 'M PLUS Rounded 1c',
      weight: '700',
    });

    console.log(fontPath);

    const width = 1920;
    const height = 1080;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');


    let bgPath: string;

    if (!ticketType) {
      bgPath = path.join(__dirname, '../assets/visual/hacker-ticket.png');
    } else if (ticketType === 'regular' || ticketType === 'friends') {
      bgPath = path.join(__dirname, '../assets/visual/regular-ticket.png');
    } else {
      bgPath = path.join(__dirname, '../assets/visual/early-bird-ticket.png');
    }

    const bg = await loadImage(bgPath);
    ctx.drawImage(bg, 0, 0, width, height);

    // Background (remove if using template)
    // ctx.fillStyle = '#ffffff';
    // ctx.fillRect(0, 0, width, height);

    // Text styling
    ctx.fillStyle = '#000000';
    ctx.font = '700 64px "M PLUS Rounded 1c"';
    console.log('Resolved →', ctx.font);
    ctx.textAlign = 'left';

    // Fixed position
    const x = 576;
    const y = 365;

    ctx.fillText(firstName, x, y);

    // Send PNG response
    // res.set({
    //   'Content-Type': 'image/png',
    //   'Content-Disposition': 'attachment; filename="ticket.png"',
    //   'Cache-Control': 'public, max-age=31536000, immutable',
    // });

    // canvas.createPNGStream().pipe(res);
    return canvas.toBuffer('image/png');
  }

  async visualTicketGenerationPng(ticketType: string, firstName: string, res: Response) {
    if (!firstName) {
      throw new BadRequestException('Missing firstName (f) parameter');
    }

    const fontPath = path.join(
      __dirname,
      '../assets/fonts/MPLUSRounded1c-ExtraBold.ttf',
    );

    registerFont(fontPath, {
      family: 'M PLUS Rounded 1c',
      weight: '700',
    });

    console.log(fontPath);

    const width = 1920;
    const height = 1080;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // OPTIONAL: use a PNG template
    const bgPath =
      ticketType === 'regular'
        ? path.join(__dirname, '../assets/visual/regular-ticket.png')
        : path.join(__dirname, '../assets/visual/early-bird-ticket.png');

    const bg = await loadImage(bgPath);
    ctx.drawImage(bg, 0, 0, width, height);

    // Background (remove if using template)
    // ctx.fillStyle = '#ffffff';
    // ctx.fillRect(0, 0, width, height);

    // Text styling
    ctx.fillStyle = '#000000';
    ctx.font = '700 64px "M PLUS Rounded 1c"';
    console.log('Resolved →', ctx.font);
    ctx.textAlign = 'left';

    // Fixed position
    const x = 576;
    const y = 365;

    ctx.fillText(firstName, x, y);

    // Send PNG response
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': 'attachment; filename="ticket.png"',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });

    canvas.createPNGStream().pipe(res);
    // return canvas.toBuffer('image/png');
  }

  async getTicketCount(ticketType: string) {
    // Total earlybird tickets available
    const ticket = await this.prisma.ticket.findFirst({
      where: { type: ticketType },
      select: { quantity: true },
    });

    if (!ticket) {
      return { ticketCount: 0 };
    }

    // Tickets already generated / sold (ONLY earlybird)
    const usedCount = await this.prisma.generatedTicket.findMany({
      where: { order: { ticket: { type: 'earlybird' } } },
    });

    return {
      ticketCount: Math.max(ticket.quantity - usedCount.length, 0),
    };
  }

  private async buildInvoiceData(
    order: any, // Prisma order with includes
  ): Promise<InvoiceData> {
    const buyer = order.buyer;
    const address = buyer.address;
    const ticket = order.ticket;

    let rzpLabel = '';

    if (order.paymentType == 'RAZORPAY' && order.razorpayPaymentId != null) {
      const payment = await this.razorpay.payments.fetch(
        order.razorpayPaymentId,
      );

      // Convert to nice label for UI
      switch (payment.method) {
        case 'upi':
          rzpLabel = 'UPI via Razorpay';
          break;
        case 'card':
          rzpLabel = 'Card via Razorpay';
          break;
        case 'netbanking':
          rzpLabel = 'Netbanking via Razorpay';
          break;
        case 'wallet':
          rzpLabel = 'Razorpay';
          break;
        default:
          rzpLabel = payment.method;
      }
    }

    const ticketInfo = await this.getCurrentTicketForInvoice();
    const quantity = order.participants.length;

    return {
      invoiceNo: order.invoiceNumber,
      date: order.createdAt.toDateString(),

      billedTo: {
        name: `${buyer.firstName} ${buyer.lastName}`,
        addressLine1: address?.line1 || '',
        city: address?.city || '',
        state: address?.state || '',
        country: address?.country || '',
        pincode: address?.postalCode || '',
      },

      item: {
        description: ticket.title,
        quantity: order.participants.length,
        price: ticket.fiat, //1249
      },

      discount: ticketInfo.discount.amount,
      gstRate: 9,

      excludingGstCost: ticketInfo.excludingGstCost,
      cgst: ticketInfo.cgst,
      sgst: ticketInfo.sgst,

      paymentMethod:
        order.paymentType === 'RAZORPAY'
          ? `INR (${rzpLabel || 'Unknown'})`
          : 'Crypto',
    };
  }

  async generateInvoiceForOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: { include: { address: true } },
        ticket: true,
        participants: true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    if (order.invoiceNumber) {
      const invoiceData = await this.buildInvoiceData(order);
      return generateInvoicePDFBuffer(invoiceData);
    }

    const invoiceNo = await generateInvoiceNumberForOrder(this.prisma, orderId);

    const invoiceData = await this.buildInvoiceData({
      ...order,
      invoiceNumber: invoiceNo,
    });

    return generateInvoicePDFBuffer(invoiceData);
  }

  async getCurrentTicketForInvoice() {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        isActive: true,
        remainingQuantity: { gt: 0 },
      },
      orderBy: { priority: 'asc' },
    });

    if (!ticket) {
      throw new NotFoundException('No active tickets available.');
    }

    const discount = getDiscount(ticket.fiat); // e.g., { amount, percentage, originalPrice }
    const discountedPrice = ticket.fiat; // price after discount

    // Default values
    let excludingGstCost = 0;
    let cgst = 0;
    let sgst = 0;

    // Set values based on discount percentage
    if (discount.percentage === 50) {
      excludingGstCost = 1153.73;
      cgst = 95.27;
      sgst = 95.27;
    } else if (discount.percentage === 40) {
      excludingGstCost = 1270.3;
      cgst = 114.35;
      sgst = 114.35;
    } else if (discount.percentage === 20) {
      excludingGstCost = 1694.00;
      cgst = 152.50;
      sgst = 152.50;
    } else {
      // fallback to 0% discount
      excludingGstCost = 2117.80;
      cgst = 190.06;
      sgst = 190.06;
    }

    return {
      ...ticket,
      discount,
      excludingGstCost,
      cgst,
      sgst,
    };
  }

  async sendEmailsWithPngTicket({ firstName, email }: { firstName: string, email: string }) {
    this.logger.log(`sendEmailsWithPngTicket called with ${email}`);

    // const participant = await this.prisma.participant.findFirst({
    //   where: {
    //     email, generatedTicket: {
    //       isNot: null,
    //     },
    //   },

    //   include: {
    //     order: {
    //       include: { ticket: true },
    //     },
    //   },
    // });

    // this.logger.log(`Participant: ${participant?.id ?? 'NOT FOUND | Ticket not generated'}`);

    // if (!participant) {
    //   throw new BadRequestException(`No participant found with email: ${email}`);
    // }

    // const ticketType = participant.order?.ticket?.type ?? 'regular';
    const ticketType = 'regular';
    this.logger.log(`Ticket type: ${ticketType}`);

    const pngBuffer = await this.visualTicketGeneration(
      ticketType,
      firstName || 'Participant',
    );

    this.logger.log(`PNG buffer generated: ${!!pngBuffer}`);

    await this.mailService.sendParticipantEmailsWithPng(firstName, email, pngBuffer);
  }

  async sendHackerEmailsWithPngTicket(firstName: string, email: string) {
    this.logger.log(`sendHackerEmailsWithPng called with ${email}`);


    const pngBuffer = await this.visualTicketGeneration(
      null,
      firstName || 'Participant',
    );

    this.logger.log(`PNG buffer generated: ${!!pngBuffer}`);

    await this.mailService.sendHackerEmailsWithPng(firstName, email, pngBuffer);
  }


  async getTicketDetails(input: string) {
  const ticket = await this.prisma.generatedTicket.findFirst({
    where: {
      OR: [
        { participant: { email: input } },
        { ticketCode: input },
      ],
    },
    include: {
      participant: true,
    },
  });

  if (!ticket) {
    throw new NotFoundException('Ticket not found');
  }

  return {
    ticketCode: ticket.ticketCode,
    participant : ticket.participant.firstName,
    participantEmail: ticket.participant.email,
    qrUrl: ticket.qrUrl,
    checkedIn: ticket.checkedIn,
    merchReceived: ticket.merchReceived,
  };
}
async markParty(token:string){
  const ticket =  await this.prisma.generatedTicket.findFirst({
      where: { ticketCode: token },
      select: { afterPartyCheckIn: true, participant: { select: { firstName: true } } }
    });

  if (ticket?.afterPartyCheckIn) {
      return { ok: true, reason: 'checkedIn', participantName: ticket.participant.firstName };
    }

   const result = await this.prisma.generatedTicket.update({
  where: { ticketCode: token },
  data: { afterPartyCheckIn: true },
  include: {
    participant: {
      select: {
        firstName: true,
      },
    },
  },
});
  

    return {
      participantName: result.participant.firstName,
      afterPartyCheckIn: result.afterPartyCheckIn,
      
    }

}

  async downloadSentRazorpayInvoices(): Promise<Buffer> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: "paid",
        paymentType: "RAZORPAY",
        buyerEmailSent: true,
        invoiceNumber: { not: null },
      },
      include: {
        buyer: { include: { address: true } },
        ticket: true,
        participants: true,
      },
    });

    const zip = new JSZip();

    for (const order of orders) {
      const invoiceData = await this.buildInvoiceData(order);
      const pdfBuffer = await generateInvoicePDFBuffer(invoiceData);

      zip.file(`Invoice_${order.invoiceNumber}.pdf`, pdfBuffer);
    }

    return zip.generateAsync({ type: "nodebuffer" });
  }
}
