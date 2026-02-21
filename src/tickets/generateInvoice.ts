import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  generateInvoicePDFBuffer,
  InvoiceData,
} from '../utils/generateInvoicePdf';
import { generateInvoiceNumberForOrder } from 'src/utils/ticket.utils';
import Razorpay from 'razorpay';
@Injectable()
export class InvoiceService {
  private razorpay: Razorpay;
  constructor(private prisma: PrismaService) {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
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
        price: ticket.fiat,
      },

      discount: 1250,
      gstRate: 18,

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
}
