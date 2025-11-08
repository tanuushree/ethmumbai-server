import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentType } from '@prisma/client';

@Injectable()
export class DaimoService {
  private readonly DAIMO_API_URL = 'https://pay.daimo.com/api/payment';
  private readonly DAIMO_API_KEY = process.env.DAIMO_API_KEY;
  private readonly DESTINATION_ADDRESS = process.env.DAIMO_DESTINATION_ADDRESS;

  constructor(private prisma: PrismaService) {}

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

      const data = response.data;
      const payId = data.payment?.id;

      console.log('✅ Daimo Payment Created:', payId);

      return {
        success: true,
        paymentId: payId,
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
}
