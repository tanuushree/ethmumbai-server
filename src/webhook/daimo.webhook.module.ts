import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DaimoWebhookController } from './daimo.webhook.controller';
import { TicketsModule } from '../tickets/tickets.module';
import { DaimoService } from '../payments/daimo.service';
import { DaimoWebhookService } from './daimo.webhook.service';

@Module({
  imports: [TicketsModule],
  controllers: [DaimoWebhookController],
  providers: [DaimoService, DaimoWebhookService],
})
export class DaimoWebhookModule {}
