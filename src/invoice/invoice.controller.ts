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
    BadRequestException,
} from '@nestjs/common';
import { TicketsService } from '../tickets/tickets.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { getDiscount } from '../utils/discount';
import type { Response } from 'express';
import {
    generateInvoicePDFBuffer,
    InvoiceData,
} from '../utils/generateInvoicePdf';
import Razorpay from 'razorpay';

export class InvoiceController {
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
    // Test API for creating Invoice Pdf
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

    // Test API for Invoice PDF generation - preview
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
}