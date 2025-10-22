import { Injectable, BadRequestException } from '@nestjs/common';
import Razorpay from 'razorpay';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RazorpayService {
  private razorpay: Razorpay;

  constructor(private prisma: PrismaService) {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  // Create Razorpay order
  async createOrder(order: any) {
    const options = {
      amount: Math.round(order.amount * 100), // INR in paise
      currency: 'INR',
      receipt: `order_rcpt_${order.id}`,
    };

    const razorpayOrder = await this.razorpay.orders.create(options);

    // Save razorpayOrderId to Payment table
    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        razorpayOrderId: razorpayOrder.id,
        status: 'created',
      },
    });

    return razorpayOrder;
  }

  // Verify Razorpay payment
  async verify(dto: any) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = dto;

    // Fetch Payment record
    const payment = await this.prisma.payment.findFirst({
      where: { razorpayOrderId: razorpay_order_id },
      include: { order: true },
    });
    if (!payment) throw new BadRequestException('Payment record not found');

    // TODO: verify signature using HMAC
    // If valid:
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { razorpayPaymentId: razorpay_payment_id, verified: true, status: 'paid' },
    });

    await this.prisma.order.update({
      where: { id: payment.orderId },
      data: { status: 'paid' },
    });

    return { success: true };
  }
}
