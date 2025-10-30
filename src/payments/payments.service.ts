import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RazorpayService } from './razorpay.service';
import { PaymentType } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private razorpayService: RazorpayService,
  ) {}

  async createRazorpayOrder(data: any) {
    const { ticketId, buyerName, buyerEmail, buyerPhone, participants, quantity } = data;

    // Fetch the ticket
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new Error('Ticket not found');

    // Calculate total amount
    const totalAmount = ticket.price * quantity;

    // Create order in Razorpay
    const razorpayOrder = await this.razorpayService.createOrder(totalAmount);

    // Save order in DB
    const order = await this.prisma.order.create({
      data: {
        razorpayOrderId: razorpayOrder.id,
        ticketId,
        buyerName,
        buyerEmail,
        buyerPhone,
        amount: totalAmount,
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
      razorpayOrderId: razorpayOrder.id,
      amount: totalAmount,
      currency: 'INR',
      order,
    };
  }

  async verifySignature(body: any) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    const verifyResult = this.razorpayService.verifySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    if (verifyResult.success) {
      // Optionally update DB
      await this.prisma.order.updateMany({
        where: { razorpayOrderId: razorpay_order_id },
        data: { paymentVerified: true, status: 'paid' },
      });
    }

    return verifyResult;
  }
}
