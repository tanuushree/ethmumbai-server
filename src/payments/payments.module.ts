import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { TicketsModule } from '../tickets/tickets.module';
import { DaimoWebhookModule } from 'src/webhook/daimo.webhook.module';
import { DaimoWebhookService } from 'src/webhook/daimo.webhook.service';
import { RazorpayService } from './razorpay.service';
import { DaimoService } from './daimo.service';

@Module({
  imports: [TicketsModule, DaimoWebhookModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    RazorpayService,
    DaimoService,
    DaimoWebhookService,
    PrismaService,
  ],
})
export class PaymentsModule {}
