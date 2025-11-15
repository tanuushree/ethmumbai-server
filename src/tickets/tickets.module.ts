import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [TicketsService, PrismaService],
  exports: [TicketsService],
})
export class TicketsModule {}
