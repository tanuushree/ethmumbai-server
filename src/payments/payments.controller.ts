import { Body, Controller, Post } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('order')
  async createOrder(@Body() body: any) {
    return await this.paymentsService.createRazorpayOrder(body);
  }

  @Post('verify')
  async verifyPayment(@Body() body: any) {
    return await this.paymentsService.verifySignature(body);
  }
}
