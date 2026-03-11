import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  BadRequestException,
  Query,
  Body,
  Res,
  StreamableFile,
} from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
// import { AdminGuard } from 'src/utils/admin.guard';
import { ApiKeyGuard } from 'src/utils/api-key-auth';
import { TicketsService } from 'src/tickets/tickets.service';
import Razorpay from 'razorpay';
import JSZip from 'jszip';
import path from 'path';
import { createCanvas, loadImage, registerFont } from 'canvas';
import type { Response } from 'express';

@Controller('internal')
// @UseGuards(AdminGuard)
@UseGuards(ApiKeyGuard)
export class InternalController {
  private readonly DAIMO_API_URL = 'https://pay.daimo.com/api/payment';
  private readonly DAIMO_API_KEY = process.env.DAIMO_API_KEY;
  private razorpay: Razorpay;
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly ticketsService: TicketsService,
  ) {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  // --- Participants ---

  @Get('participants')
  async getAllParticipants() {
    return this.prisma.participant.findMany({
      include: { generatedTicket: true, order: true },
      orderBy: { id: 'desc' },
    });
  }

  @Get('participants/:id/tickets')
  async getTicketsForParticipant(@Param('id') id: string) {
    const tickets = await this.prisma.generatedTicket.findMany({
      where: { participantId: id },
    });
    if (!tickets.length)
      throw new BadRequestException('No tickets found for this participant');
    return tickets;
  }

  // --- Orders ---

  @Get('orders')
  async getAllOrders() {
    return this.prisma.order.findMany({
      include: { participants: { include: { generatedTicket: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('orders/buyer/:email')
  async getOrderByBuyer(@Param('email') email: string) {
    return this.prisma.buyer.findFirst({
      where: { email: email },
      include: {
        order: {
          include: { participants: { include: { generatedTicket: true } } },
        },
      },
    });
  }

  @Get('orders/participant/:participantId')
  async getOrderByParticipant(@Param('participantId') participantId: string) {
    const participant = await this.prisma.participant.findUnique({
      where: { id: participantId },
      include: { order: true, generatedTicket: true },
    });
    if (!participant) throw new BadRequestException('Participant not found');
    return {
      participant,
      order: participant.order,
      ticket: participant.generatedTicket,
    };
  }

  // ---------------- BUYERS ----------------

  // GET /internal/buyers
  @Get('buyers')
  async getAllBuyers() {
    return this.prisma.buyer.findMany({
      include: {
        address: true,
        order: {
          include: {
            participants: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });
  }

  // GET /internal/buyers/:id
  @Get('buyers/:id')
  async getBuyerById(@Param('id') id: string) {
    const buyer = await this.prisma.buyer.findUnique({
      where: { id },
      include: {
        address: true,
        order: {
          include: {
            participants: true,
          },
        },
      },
    });

    if (!buyer) throw new BadRequestException('Buyer not found');
    return buyer;
  }

  // GET /internal/buyers/search?email=
  @Get('buyers/search')
  async searchBuyer(@Query('email') email: string) {
    if (!email) {
      throw new BadRequestException('Email query param required');
    }

    return this.prisma.buyer.findMany({
      where: {
        email: { contains: email, mode: 'insensitive' },
      },
      include: {
        order: true,
      },
    });
  }

  // ---------------- TICKETS ----------------

  // POST /internal/tickets/:code/verify
  @Post('tickets/:code/verify')
  async verifyTicket(@Param('code') code: string) {
    const ticket = await this.prisma.generatedTicket.findUnique({
      where: { ticketCode: code },
    });

    if (!ticket) throw new BadRequestException('Ticket not found');
    if (ticket.checkedIn) {
      throw new BadRequestException('Ticket already checkedIn');
    }

    await this.prisma.generatedTicket.update({
      where: { ticketCode: code },
      data: {
        checkedIn: true,
        checkedInAt: new Date(),
      },
    });

    return { success: true, message: 'Ticket Checked In' };
  }

  // POST /internal/tickets/:code/unverify
  @Post('tickets/:code/unverify')
  async unverifyTicket(@Param('code') code: string) {
    const ticket = await this.prisma.generatedTicket.findUnique({
      where: { ticketCode: code },
    });

    if (!ticket) throw new BadRequestException('Ticket not found');

    await this.prisma.generatedTicket.update({
      where: { ticketCode: code },
      data: {
        checkedIn: false,
      },
    });

    return { success: true, message: 'Ticket unverified' };
  }

  // --- Transactions ---

  @Get('transactions')
  async getAllTransactions() {
    return this.prisma.order.findMany({
      where: { status: { in: ['paid', 'completed', 'success'] } },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        paymentType: true,
        razorpayPaymentId: true,
        daimoPaymentId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // GET /payments/status/:orderId
  @Get('payments/status/:orderId')
  async getPaymentStatus(@Param('orderId') orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        paymentType: true,
        amount: true,
        currency: true,
      },
    });

    if (!order) throw new BadRequestException('Order not found');

    return order;
  }

  @Get('payments/daimo/:payId')
  async getPaymentWithPayId(@Param('payId') payId: string) {
    try {
      const response = await axios.get(`${this.DAIMO_API_URL}/${payId}`, {
        headers: {
          'Api-Key': this.DAIMO_API_KEY,
        },
      });

      return response.data;
    } catch (error) {
      throw new BadRequestException(
        error?.response?.data || 'Failed to fetch Daimo payment',
      );
    }
  }

  // --- Emails ---
  // @Post('email/buyer/:orderId')
  // async resendBuyerEmail(@Param('orderId') orderId: string) {
  //   await this.mailService.sendBuyerEmail(orderId);
  //   return { success: true, message: 'Buyer email resent' };
  // }

  // @Post('email/participants/:orderId')
  // async resendParticipantEmails(@Param('orderId') orderId: string) {
  //   await this.mailService.sendParticipantEmails(orderId);
  //   return { success: true, message: 'Participant emails resent' };
  // }

  @Get('check-email')
  async checkEmail(@Query('email') email: string) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const participant = await this.prisma.participant.findFirst({
      where: {
        email: email,
        order: { status: 'paid' },
      },
    });

    if (participant) return { exists: true };
    return { exists: false };
  }

  //success endpoint for order success page
  @Get('orders/success/:orderId')
  async getOrderForSuccessPage(@Param('orderId') orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: {
          include: { address: true },
        },
        participants: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            generatedTicket: { select: { ticketCode: true } },
          },
        },
        ticket: true,
      },
    });

    if (!order) {
      throw new BadRequestException('Order not found');
    }

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

    return {
      success: true,
      order: {
        orderId: order.id,
        transactionId: order.razorpayPaymentId || order.daimoPaymentId || 'N/A',
        status: order.status,
        ticketTitle: order.ticket.title,
        ticketType: order.ticket.type,
        quantity: order.participants.length,
        paymentMethod:
          order.paymentType === 'RAZORPAY'
            ? `INR (${rzpLabel || 'Unknown'})`
            : 'Crypto',
        purchaseDate: order.createdAt,
        orderFiat: order.ticket.fiat,
        orderCrypto: order.ticket.crypto,
        totalAmount: order.amount,
        currency: order.currency,
        buyerEmail: order.buyer.email,
        buyerName: `${order.buyer.firstName} ${order.buyer.lastName}`,
        participants: order.participants.map((p) => ({
          name: `${p.firstName} ${p.lastName}`,
          email: p.email,
          ticketCode: p.generatedTicket?.ticketCode || 'Pending',
        })),
      },
    };
  }

  @Post('status-by-users')
  async getOrderStatusByUsers(@Body() users: { email: string }[]) {
    return this.ticketsService.getOrderStatusByUsers(users);
  }

  //endpoint to send free tickets
  @Post('sendTickets')
  async sendTickets(
    @Body() body: { firstName: string; lastName: string; email: string }[],
  ) {
    // const { firstName, lastName, email } = body;
    const ticket = await this.prisma.ticket.findFirst({
      where: { type: 'friends' },
    });
    if (!ticket) {
      throw new BadRequestException('Ticket not found');
    }
    for (const { firstName, lastName, email } of body) {
      const existingParticipant = await this.prisma.participant.findUnique({
        where: { email: email, order: { status: 'paid' } },
        include: { order: true, generatedTicket: true },
      });

      if (existingParticipant) {
        console.log('Participant already exists:', existingParticipant.email);
        // if (existingParticipant.generatedTicket?.ticketCode == null) {
        //   console.log(
        //     'Participant exists but ticket not generated. Generating...for:',
        //     existingParticipant.email,
        //   );
        //   await this.ticketsService.generateTicketsForOrder(
        //     existingParticipant.order.id,
        //   );
        // } else {
        //   console.log(
        //     '✅ Ticket already generated for participant:',
        //     existingParticipant.email,
        //   );
        // }
      }

      //create order with buyer details - null + participant
      if (!existingParticipant) {
        const order = await this.prisma.order.create({
          data: {
            daimoPaymentId: null,
            ticket: { connect: { id: ticket.id } },
            buyer: {
              create: {
                firstName: firstName,
                lastName: lastName ?? null,
                email: 'website@ethmumbai.in',
                address: {
                  create: {
                    line1: '',
                    line2: null,
                    city: '',
                    state: '',
                    country: '',
                    postalCode: '',
                  },
                },
              },
            },
            amount: 0,
            currency: 'USD',
            paymentType: null,
            participants: {
              create: {
                firstName: firstName,
                lastName: lastName,
                email: email,
                isBuyer: false,
              },
            },
          },
        });

        const createdOrder = await this.prisma.order.findUnique({
          where: { id: order.id },
          include: { participants: true },
        });

        //generate ticket
        if (createdOrder) {
          await this.ticketsService.generateTicketsForOrder(createdOrder.id);
          console.log(
            '✅ Ticket generated for order:',
            createdOrder.participants,
          );
        }
      }

    }

    return { success: true, message: `Tickets processed for ${body.length || 0} participants` };
  }

  @Post('sendTicketsForExistingOrder')
  async sendTicketsForExistingOrder(
    @Body() body: { firstName: string; lastName: string; email: string }[],
  ) {
    const results: {
      email: string;
      status: 'SUCCESS' | 'SKIPPED';
      reason?: string;
      orderId?: string;
    }[] = [];

    for (const { email } of body) {
      const participant = await this.prisma.participant.findUnique({
        where: { email },
        include: {
          order: true,
        },
      });

      if (!participant) {
        results.push({
          email,
          status: 'SKIPPED',
          reason: 'Participant not found',
        });
        continue;
      }

      if (!participant.order) {
        results.push({
          email,
          status: 'SKIPPED',
          reason: 'Order not found',
        });
        continue;
      }

      if (participant.order.paymentVerified) {
        results.push({
          email,
          status: 'SKIPPED',
          reason: 'Payment already verified',
        });
        continue;
      }

      // ✅ Generate tickets (reuses existing logic)
      await this.ticketsService.generateTicketsForOrder(participant.order.id);

      // ✅ Mark tickets as sent at ORDER level
      await this.prisma.order.update({
        where: { id: participant.order.id },
        data: {
          buyerEmailSent: true,
          buyerEmailSentAt: new Date(),
        },
      });

      results.push({
        email,
        status: 'SUCCESS',
        orderId: participant.order.id,
      });
    }

    return {
      processed: body.length,
      results,
    };
  }

  @Post('sendManualTicket')
  async sendManualTicket(
    @Body()
    body: {
      firstName?: string;
      email: string;
    },
  ) {
    return this.ticketsService.generateAndSendTicketForParticipant({
      firstName: body.firstName,
      email: body.email,
    });
  }

  @Get('social/hacker')
  async hackerSocialGeneration(@Query('firstName') firstName: string) {
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
    const bgPath = path.join(__dirname, '../assets/visual/hacker-ticket.png');

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
    const buffer = canvas.toBuffer('image/png');

    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: 'attachment; filename="ticket.png"',
    });

    // res.set({
    //   'Content-Type': 'image/png',
    //   'Content-Disposition': 'attachment; filename="ticket.png"',
    //   'Cache-Control': 'public, max-age=31536000, immutable',
    // });

    // canvas.createPNGStream().pipe(res);
  }

  @Get("download/razorpay-invoices")
  @UseGuards(ApiKeyGuard)
  async download(@Res() res: Response) {
    const zip = await this.ticketsService.downloadSentRazorpayInvoices();

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": "attachment; filename=sent_razorpay_invoices.zip",
    });

    res.send(zip);
  }

}
