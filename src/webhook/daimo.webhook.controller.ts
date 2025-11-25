// src/webhooks/daimo-webhook.controller.ts
import { Controller, Post, Body, Headers, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DaimoWebhookService } from './daimo.webhook.service';

@Controller('webhooks')
export class DaimoWebhookController {
  constructor(private readonly daimoWebhookService: DaimoWebhookService) {}

  @Post('daimo')
  async handle(
    @Body() body: any,
    @Headers('authorization') auth: string,
    @Res() res: Response,
  ) {
    // Basic auth check – use the token Daimo gave you for this webhook
    const expected = `Basic ${process.env.DAIMO_WEBHOOK_TOKEN}`;
    if (!auth || auth !== expected) {
      return res.status(401).send('unauthorized');
    }

    // Immediately acknowledge so Daimo doesn't retry
    res.status(200).send('ok');

    // Then process asynchronously
    await this.daimoWebhookService.handle(body);
  }
}
