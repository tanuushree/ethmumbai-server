import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';

type DaimoEventType =
  | 'payment_started'
  | 'payment_completed'
  | 'payment_bounced'
  | 'payment_refunded';

interface DaimoPaymentObject {
  id: string;
  status?: string;
  // add more fields as you need from Daimo's docs
  metadata?: any;
}

@Injectable()
export class DaimoService {
  private readonly DAIMO_API_URL = 'https://pay.daimo.com/api/payment';
  private readonly DAIMO_API_KEY = process.env.DAIMO_API_KEY;
  private readonly DESTINATION_ADDRESS = process.env.DAIMO_DESTINATION_ADDRESS;

  private readonly logger = new Logger(DaimoService.name);

  constructor(
    private prisma: PrismaService,
    private ticketsService: TicketsService,
  ) {}

  /**
   * Create a Daimo payment order
   */
  async createOrder(amount: number, currency = 'USDC') {
    if (!this.DAIMO_API_KEY || !this.DESTINATION_ADDRESS) {
      throw new InternalServerErrorException('Missing Daimo configuration');
    }

    try {
      // Daimo expects amount in string, and USDC token address on Base (mainnet)
      const payload = {
        display: {
          intent: 'Checkout',
        },
        destination: {
          destinationAddress: this.DESTINATION_ADDRESS,
          chainId: 8453, // Base mainnet
          tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
          amountUnits: amount.toString(), // <-- FIXED: amount passed from argument
        },
        metadata: {
          system: 'ETHMumbai',
          currency: currency,
        },
      };

      const response = await axios.post(this.DAIMO_API_URL, payload, {
        headers: {
          'Api-Key': this.DAIMO_API_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (response.status == 0) {
        const text = response.statusText;
        this.logger.error(
          `Daimo create payment failed: ${response.status} - ${text}`,
        );
        throw new Error('Failed to create Daimo payment');
      }

      // const data = response.data;
      const payId = await response.data.payment?.id;

      console.log('✅ Daimo Payment Created:', payId);

      //return and create order in DB
      return {
        success: true,
        paymentId: payId,
        status: response.data?.status || 'created',
      };
    } catch (error) {
      console.error(
        '❌ Daimo createOrder error:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException('Failed to create Daimo order');
    }
  }

  /**
   * Verify Daimo Payment by Payment ID
   */
  async verifyPayment(paymentId: string) {
    if (!paymentId) throw new BadRequestException('Missing Daimo paymentId');

    try {
      const response = await axios.get(`${this.DAIMO_API_URL}/${paymentId}`, {
        headers: { 'Api-Key': this.DAIMO_API_KEY },
      });

      const payment = response.data?.payment || response.data;

      console.log('🧾 Daimo payment fetched:', payment);

      const isComplete = payment.status === 'payment_complete';
      // ✅ Update the order in DB based on paymentId
      await this.prisma.order.updateMany({
        where: { daimoPaymentId: paymentId },
        data: {
          status: isComplete ? 'paid' : 'pending',
          daimoTxHash: payment.destination.txHash,
          paymentVerified: true,
        },
      });

      // Ticket Generation
      if (isComplete == true) {
        const orderComplete = await this.prisma.order.findFirst({
          where: { daimoPaymentId: paymentId },
        });
        if (orderComplete?.id) {
          await this.ticketsService.generateTicketsForOrder(orderComplete.id);
        }
      }

      return {
        success: isComplete,
        status: payment.status,
        message: isComplete
          ? '✅ Payment verified successfully'
          : `⚠️ Payment not completed. Status: ${payment.status}`,
      };
    } catch (error) {
      console.error(
        '❌ Error verifying Daimo payment:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException('Failed to verify Daimo payment');
    }
  }

  async markPaymentStatus(payId: string, status: string, meta?: any) {
    // find by providerPaymentId or externalId
    await this.prisma.order.updateMany({
      where: { daimoPaymentId: payId },
      data: {
        status,
      },
    });
    console.log(meta);
  }

  // =======================================
  // 3) Main entry for Daimo webhook payload
  // =======================================
  /**
   * Called by your Daimo webhook controller.
   * It:
   *  - figures out which payment row to update
   *  - maps Daimo event type -> your internal payment status
   *  - attaches useful metadata from the webhook
   */
  async handleDaimoWebhook(payload: any) {
    this.logger.log(`Received Daimo webhook: ${payload.type} ${payload.payId}`);

    const payId = payload.payId || payload.payment?.id;

    if (!payId) {
      this.logger.error('Daimo webhook missing paymentId/payment.id');
      return;
    }

    // You can add more structured metadata here if you like
    const meta = {
      daimoEventType: payload.type,
      daimoStatus: payload.payment?.status,
      txHash: payload.txHash,
      chainId: payload.chainId,
      rawPaymentMetadata: payload.payment?.metadata ?? null,
    };

    switch (payload.type) {
      case 'payment_started':
        await this.markPaymentStatus(payId, 'started', meta);
        break;

      case 'payment_completed':
        await this.markPaymentStatus(payId, 'completed', meta);
        // here you can also trigger post-payment logic:
        // - mark order as paid
        // - send confirmation, etc. (either here or in another method)
        break;

      case 'payment_bounced':
        await this.markPaymentStatus(payId, 'bounced', meta);
        break;

      case 'payment_refunded':
        await this.markPaymentStatus(payId, 'refunded', meta);
        break;

      default:
        this.logger.warn(
          `Unhandled Daimo event type: ${payload.type as string}`,
        );
    }
  }
}
