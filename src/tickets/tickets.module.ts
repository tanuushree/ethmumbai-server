import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketsController } from './tickets.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  providers: [TicketsService, PrismaService],
  controllers: [TicketsController],
  exports: [TicketsService],
})
export class TicketsModule {}
