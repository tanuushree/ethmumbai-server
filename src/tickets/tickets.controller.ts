import {
  Controller,
  Get,
  Query,
  UseGuards,
  Headers,
  Body,
  Post,
  Param,
  Res,
  InternalServerErrorException,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { getDiscount } from '../utils/discount';
import type { Response } from 'express';
import * as QRCode from 'qrcode';
// import { generateTicketsForOrder } from ./TicketsService
import { generateTicketPDF } from './generateTicket';
import {
  generateInvoicePDFBuffer,
  InvoiceData,
} from '../utils/generateInvoicePdf';
import PDFDocument from 'pdfkit';
import * as path from 'path';
import * as fs from 'fs';
import { createCanvas, loadImage, registerFont } from 'canvas';
import { ApiKeyGuard } from '../utils/api-key-auth';
import Razorpay from 'razorpay';
import { generateInvoiceNumberForOrder } from 'src/utils/ticket.utils';

registerFont('assets/fonts/MPLUSRounded1c-Bold.ttf', {
  family: 'Rounded Mplus 1c',
  weight: 'bold',
  style: 'not-rotated',
});

@Controller('t')
export class TicketsController {
  private razorpay: Razorpay;
  constructor(
    private readonly ticketService: TicketsService,
    private readonly mailService: MailService,
    private readonly prisma: PrismaService,
  ) {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  @Get('/currentInvoiceTicket')
  async getCurrentTicketForInvoice() {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        isActive: true,
        remainingQuantity: { gt: 0 },
      },
      orderBy: { priority: 'asc' },
    });

    if (!ticket) {
      return { message: 'No active tickets available.' };
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

  @Get('/current')
  async getCurrentTicket() {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        isActive: true,
        remainingQuantity: { gt: 0 },
      },
      orderBy: { priority: 'asc' },
    });

    if (!ticket) {
      return { message: 'No active tickets available.' };
    }

    return {
      ...ticket,
      discount: getDiscount(ticket.fiat),
    };
  }

  @Get('/preview/pdf')
  async previewTicketPdf(
    @Query('name') name: string,
    @Query('ticketId') ticketId: string,
    @Res() res: Response,
  ) {
    if (!name || !ticketId) {
      return res.status(400).json({
        error: 'name and ticketId are required',
      });
    }

    const qrBuffer = await QRCode.toBuffer(ticketId);

    const pdfDoc = generateTicketPDF({
      name,
      ticketId,
      qrImage: qrBuffer,
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ticket-${ticketId}.pdf"`,
    });

    pdfDoc.pipe(res);
  }
  @Get('/visual/:ticketType')
  async visualTicket(
    @Param('ticketType') ticketType: string,
    @Query('firstName') firstName: string,
    @Res() res: Response,
  ) {
    await this.ticketService.visualTicketGenerationPng(ticketType, firstName, res);
  }

  @Post('sendEmailsWithPng')
  async sendEmailsWithPng(@Body() body: { firstName: string, email: string }) {
    console.log('Sending PNG ticket email to:', body.email);
    await this.ticketService.sendEmailsWithPngTicket(body);
    console.log('PNG ticket email sent successfully');
    return {
      success: true,
      message: `PNG ticket email sent to ${body.email}`,
    };
  }

  // @Post('sendEmailsWithPngForMultiple')
  // async sendEmailsWithPngForMultiple() {
  //   const body = this.prisma.participant.findMany({
  //     where: {
  //      generatedTicket: {
  //         isNot: null,
  //       },
  //     }
  //   });

  //   for (const participant of await body) {
  //     console.log('Sending PNG ticket email to:', participant.email);
  //     await this.ticketService.sendEmailsWithPngTicket({ email: participant.email });
  //     console.log('PNG ticket email sent successfully to:', participant.email);
  //   }
  //   return {
  //     success: true,
  //     message: `PNG ticket email sent to ${(await body).length}`,
  //   };
  // }

  @Post('hacker/sendEmailsWithPng')
  async sendHackerEmailsWithPng(@Body() body: { firstName:string, email: string } []) {
    for (const { firstName, email } of body) {
      await this.ticketService.sendHackerEmailsWithPngTicket(firstName, email);
    }
    return {
      success: true,
      message: `PNG hacker emails sent to ${body.length}`,
    };
  }


  // @Get('/ticketCount/:ticketType')
  // async getTicketCountByType(@Param('ticketType') ticketType: string) {
  //   return await this.ticketService.getTicketCount(ticketType);
  // }

  // @Get('/ticketCount')
  // async getTicketCount(@Param('ticketType') ticketType: string) {
  //   return await this.ticketService.getTicketCount();
  // }

  @Get('preview-invoice/:orderId')
  async previewInvoice(
    @Param('orderId') orderId: string,
    @Res() res: Response,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: {
          include: { address: true },
        },
        ticket: true,
        participants: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

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

    const invoiceData: InvoiceData = {
      invoiceNo: order.invoiceNumber,
      date: order.createdAt.toDateString(),

      billedTo: {
        name: `${buyer.firstName} ${buyer.lastName}`,
        addressLine1: address?.line1 || '',
        city: address?.city || '',
        state: address?.state || '',
        country: address?.state || '',
        pincode: address?.postalCode || '',
      },

      item: {
        description: ticket.title,
        quantity: order.participants.length,
        price: ticket.fiat,
      },

      discount: 0,
      gstRate: 18,

      paymentMethod:
        order.paymentType === 'RAZORPAY'
          ? `INR (${rzpLabel || 'Unknown'})`
          : 'Crypto',
    };

    const pdfBuffer = await generateInvoicePDFBuffer(invoiceData);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="invoice.pdf"',
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
  }

  @Get('invoice/generate/:orderId')
  async generateInvoice(
    @Param('orderId') orderId: string,
    @Res() res: Response,
  ) {
    if (!orderId) {
      throw new BadRequestException('orderId is required');
    }

    const pdfBuffer = await this.ticketService.generateInvoiceForOrder(orderId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="invoice-${orderId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
  }



   @Get('/details/:input')
  async getTicketDetails(@Param('input') input: string){
    console.log('🎯 Controller hit with input:', input);
    return await this.ticketService.getTicketDetails(input);
  }

  //check-in is happening when this endpoint is hit -> change this to include a button/check that can be used by the team to check-in
  @UseGuards(ApiKeyGuard)
  @Get('/:token')
  async verify(@Param('token') token: string,  @Query('checkedInBy') checkedInBy: string,) {
    //show the participant details if the token is valid
    //have a seperate call for verifying ticket
    const resp = await this.ticketService.verifyAndMark(token, checkedInBy);
    const isAlreadyCheckedIn = resp?.ok === true && resp?.reason === "checkedIn";

return {
  ok: true,
  reason: isAlreadyCheckedIn ? resp.reason : undefined,
  message: isAlreadyCheckedIn
    ? `Hi ${resp?.participantName}, you are checked in!`
    : `Hi ${resp?.participantName}, Welcome to ETHMumbai!`,
  participantName: resp?.participantName,
  ticketType: resp?.ticketTypeTitle,
  ticketCode: token,
  buyerName: resp?.buyerName,
  merchReceived: resp?.merchReceived
};
  }

  @UseGuards(ApiKeyGuard)
  @Post('merch/:token')
async verifyMerch(
  @Param('token') token: string,
) {
  console.log('🎯 Merch mark request for token:', token);
  const resp = await this.ticketService.markMerch(token);

  return {ok:true, message: 'Merch marked as received for ticket code: ' + token};
}


 
}
