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
import { generateTicketPDF } from './generateTicket';
import { createCanvas, loadImage, registerFont } from 'canvas';
import { ApiKeyGuard } from '../utils/api-key-auth';
import Razorpay from 'razorpay';

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

  // Client Side API Call
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

    const discount = getDiscount(ticket.fiat); 
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

  // Client Side API Call
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

  //Client Side API Call
  @Get('/visual/:ticketType')
  async visualTicket(
    @Param('ticketType') ticketType: string,
    @Query('firstName') firstName: string,
    @Res() res: Response,
  ) {
    await this.ticketService.visualTicketGenerationPng(ticketType, firstName, res);
  }

  // Test API for PDF generation - preview
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

   @Get('/details/:input')
  async getTicketDetails(@Param('input') input: string){
    console.log('🎯 Controller hit with input:', input);
    return await this.ticketService.getTicketDetails(input);
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

   @Post('send-devcon')
  async sendDevconEmails() {
    await this.mailService.sendEmails();

    return {
      success: true,
      message: 'Devcon emails sending started',
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
