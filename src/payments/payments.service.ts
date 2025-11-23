import { Injectable, BadRequestException } from '@nestjs/common';
// import { generateTicketCode } from '../utils/ticket.utils';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { RazorpayService } from './razorpay.service';
import { DaimoService } from './daimo.service';
import { PaymentType } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private razorpayService: RazorpayService,
    private daimoService: DaimoService,
    private ticketsService: TicketsService,
  ) {}

  async createRazorpayOrder(data: any) {
    const {
      ticketType,
      buyerName,
      buyerEmail,
      buyerPhone,
      participants,
      quantity,
    } = data;

    // Fetch the ticket
    const ticket = await this.prisma.ticket.findFirst({
      where: { type: ticketType },
    });
    if (!ticket) throw new BadRequestException('Ticket not found');

    // Calculate total amount
    const totalAmount = ticket.fiat * quantity;

    // Create order in Razorpay
    const razorpayOrder = await this.razorpayService.createOrder(totalAmount);

    // Save order in DB
    const order = await this.prisma.order.create({
      data: {
        razorpayOrderId: razorpayOrder.id,
        ticketId: ticket.id,
        buyerName,
        buyerEmail,
        buyerPhone,
        amount: totalAmount,
        currency: 'INR',
        paymentType: PaymentType.RAZORPAY,
        participants: {
          create: participants.map((p) => ({
            name: p.name,
            email: p.email,
            isBuyer: p.isBuyer ?? false,
          })),
        },
      },
      include: { participants: true },
    });

    // Return combined response
    return {
      success: true,
      razorpayOrderId: razorpayOrder.id,
      amount: totalAmount,
      currency: 'INR',
      orderId: order.id,
      order,
    };
  }

  // DAIMO ORDER CREATION
  async createDaimoOrder(data: any) {
    const {
      ticketType,
      buyerName,
      buyerEmail,
      buyerPhone,
      participants,
      quantity,
    } = data;

    // check the ticketId sent from frontend exists in the Tickets table
    const ticket = await this.prisma.ticket.findFirst({
      where: { type: ticketType },
    });
    if (!ticket) throw new BadRequestException('Ticket not found');

    // calculate total amount
    const totalAmount = ticket.crypto * quantity; //0.1

    // call helper function to create Daimo Pay order and pass total amountas argument
    const daimoOrder = await this.daimoService.createOrder(totalAmount);

    // create an order in th Orders table with response from razorpay
    const order = await this.prisma.order.create({
      data: {
        daimoPaymentId: daimoOrder.paymentId,
        ticketId: ticket.id,
        buyerName,
        buyerEmail,
        buyerPhone,
        amount: totalAmount,
        currency: 'USDC',
        paymentType: PaymentType.DAIMO,
        participants: {
          create: participants.map((p) => ({
            name: p.name,
            email: p.email,
            isBuyer: p.isBuyer ?? false,
          })),
        },
      },
      include: { participants: true },
    });

    // return back the response to frontend
    return {
      success: true,
      paymentId: daimoOrder.paymentId,
      orderId: order.id,
      order,
    };
  }

  // 🔹 VERIFY (Razorpay OR Daimo)
  async verifyPayment(body: any) {
    if (body.paymentType === 'DAIMO') {
      return await this.daimoService.verifyPayment(body.paymentId);
    }

    // Razorpay fallback
    return this.verifySignature(body);
  }

  async verifySignature(body: any) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    const verifyResult = await this.razorpayService.verifySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    if (verifyResult.success) {
      const order = await this.prisma.order.findFirst({
        where: { razorpayOrderId: razorpay_order_id },
      });

      if (!order) throw new BadRequestException('Order not found');

      await this.prisma.order.update({
        where: { razorpayOrderId: razorpay_order_id },
        data: {
          paymentVerified: true,
          status: 'paid',
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
        },
      });

      // Generate tickets through TicketsService
      await this.ticketsService.generateTicketsForOrder(order.id);
    }

    return verifyResult;
  }
}
