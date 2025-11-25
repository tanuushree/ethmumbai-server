// src/webhooks/daimo-webhook.controller.ts
import {
  Controller,
  Post,
  Body,
  Headers,
  Res,
  Injectable,
} from '@nestjs/common';
import { DaimoService } from '../payments/daimo.service';

@Injectable()
export class DaimoWebhookService {
  constructor(private readonly daimoService: DaimoService) {}

  async handle(body: any) {
    // Then process asynchronously
    await this.daimoService.handleDaimoWebhook(body);
  }
}
