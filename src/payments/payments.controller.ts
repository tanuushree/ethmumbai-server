import { Controller, Post, Body } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-order')
  async createOrder(@Body() dto: { cartId: string; paymentType: 'RAZORPAY' | 'DAIMO' }) {
    return this.paymentsService.createOrder(dto.cartId, dto.paymentType);
  }

  @Post('verify')
  async verifyPayment(@Body() dto: any) {
    return this.paymentsService.verifyPayment(dto);
  }
}
