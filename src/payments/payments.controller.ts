import { Body, Controller, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Razorpay order creation
  @Post('order')
  async createRazorpayOrder(@Body() body: any) {
    return await this.paymentsService.createRazorpayOrder(body);
  }

  // Daimo order creation
  @Post('create-order')
  async createDaimoOrder(@Body() body: any) {
    return await this.paymentsService.createDaimoOrder(body);
  }

  // Verify payments (both Razorpay & Daimo)
  @Post('verify')
  async verifyPayment(@Body() body: any) {
    return await this.paymentsService.verifyPayment(body);
  }
}
