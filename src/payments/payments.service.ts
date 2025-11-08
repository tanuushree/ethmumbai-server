import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RazorpayService } from './razorpay.service';
import { PaymentType } from '@prisma/client';
import axios from 'axios';
import { DaimoService } from './daimo.service';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private razorpayService: RazorpayService,
    private daimoService: DaimoService,
  ) {}

  // RAZORPAY ORDER CREATION
  async createRazorpayOrder(data: any) {
    const {
      ticketId,
      buyerName,
      buyerEmail,
      buyerPhone,
      participants,
      quantity,
    } = data;

    // check the ticketId sent from frontend exists in the Tickets table
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new Error('Ticket not found');

    // calculate total amount
    const totalAmount = ticket.fiat * quantity;

    // call helper function to create Razorpay order pass total amountas argument
    const razorpayOrder = await this.razorpayService.createOrder(totalAmount);

    // create an order in th Orders table with response from razorpay
    const order = await this.prisma.order.create({
      data: {
        razorpayOrderId: razorpayOrder.id, // from Razorpay response
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

    // return back the response to frontend
    return {
      razorpayOrderId: razorpayOrder.id,
      amount: totalAmount,
      currency: 'INR',
      order,
    };
  }

  // DAIMO ORDER CREATION
  async createDaimoOrder(data: any) {
    const {
      ticketId,
      buyerName,
      buyerEmail,
      buyerPhone,
      participants,
      quantity,
    } = data;

    // check the ticketId sent from frontend exists in the Tickets table
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new Error('Ticket not found');

    // calculate total amount
    const totalAmount = ticket.crypto * quantity; //0.1

    // call helper function to create Daimo Pay order and pass total amountas argument
    const daimoOrder = await this.daimoService.createOrder(totalAmount);

    // create an order in th Orders table with response from razorpay
    const order = await this.prisma.order.create({
      data: {
        ticketId,
        buyerName,
        buyerEmail,
        buyerPhone,
        amount: totalAmount,
        paymentType: PaymentType.DAIMO,
        currency: 'USDC',
        daimoPaymentId: daimoOrder.paymentId, // from Daimo response
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

    // const daimoPaymentStatus = await this.daimoService.verifyPayment(
    //   daimoOrder.paymentId,
    // );

    // return back the response to frontend
    return {
      success: true,
      paymentId: daimoOrder.paymentId,
      order,
    };
  }

  // 🔹 VERIFY (Razorpay OR Daimo)
  async verifyPayment(body: any) {
    if (body.paymentType === 'DAIMO') {
      return await this.daimoService.verifyPayment(body.paymentId);
    }
    // const res = await axios.get(
    //   `https://api.daimo.xyz/api/payment/${body.paymentId}`,
    //   {
    //     headers: { Authorization: `Bearer ${process.env.DAIMO_API_KEY}` },
    //   },
    // );

    // if (res.data.payment.status === 'payment_complete') {
    //   await this.prisma.order.updateMany({
    //     where: { daimoPaymentId: body.paymentId },
    //     data: { status: 'paid' },
    //   });
    //   return {
    //     success: true,
    //     message: 'Daimo payment verified successfully',
    //   };
    // } else {
    //   return { success: false, message: 'Payment not completed yet' };
    // }
    // }

    // Razorpay fallback
    return this.verifySignature(body);
  }

  async verifySignature(body: any) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    const verifyResult = this.razorpayService.verifySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    if (verifyResult.success) {
      await this.prisma.order.updateMany({
        where: { razorpayOrderId: razorpay_order_id },
        data: { paymentVerified: true, status: 'paid' },
      });
    }

    return verifyResult;
  }
}
