import { Injectable } from '@nestjs/common';

@Injectable()
export class DaimoService {
  async createOrder(order: any) {
    // You can generate a Daimo payment payload here
    return { txData: 'stub-for-daimo' };
  }

  async verify(dto: any) {
    // Call Daimo API / check on-chain transaction
    return { success: true };
  }
}
