import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RazorpayService } from './razorpay.service';
import { DaimoService } from './daimo.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, RazorpayService, DaimoService, PrismaService],
})
export class PaymentsModule {}
