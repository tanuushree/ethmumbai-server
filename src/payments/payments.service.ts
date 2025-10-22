import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RazorpayService } from './razorpay.service';
import { DaimoService } from './daimo.service';
import { PaymentType, Order, Payment } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpayService: RazorpayService,
    private readonly daimoService: DaimoService,
  ) {}

  /**
   * Create a new order (Razorpay or Daimo)
   */
  async createOrder(cartId: string, paymentType: PaymentType): Promise<{ order: Order; paymentPayload: any }> {
    // 1️⃣ Fetch Cart + Ticket + Participants
    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: { ticket: true, participants: true },
    });
    if (!cart) throw new BadRequestException('Cart not found');

    const amount = cart.ticket.price * cart.quantity;

    // 2️⃣ Create Order in DB
    const order = await this.prisma.order.create({
      data: {
        cartId: cart.id,
        ticketId: cart.ticket.id,
        amount,
        currency: 'INR',
        status: 'created',
        paymentType,
      },
    });

    // 3️⃣ Create payment via provider
    let paymentPayload: any;
    if (paymentType === PaymentType.RAZORPAY) {
      paymentPayload = await this.razorpayService.createOrder(order);
    } else if (paymentType === PaymentType.DAIMO) {
      paymentPayload = await this.daimoService.createOrder(order);
    } else {
      throw new BadRequestException('Invalid payment type');
    }

    return { order, paymentPayload };
  }

  /**
   * Verify payment callback (Razorpay or Daimo)
   */
  async verifyPayment(dto: any): Promise<{ success: boolean }> {
    const { paymentType } = dto;

    if (paymentType === PaymentType.RAZORPAY) {
      return this.razorpayService.verify(dto);
    } else if (paymentType === PaymentType.DAIMO) {
      return this.daimoService.verify(dto);
    }

    throw new BadRequestException('Invalid payment type');
  }
}
