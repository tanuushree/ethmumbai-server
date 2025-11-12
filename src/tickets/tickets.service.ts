import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  //Generates a unique, non-reversible ticket code based on participant email + randomness
  private generateTicketCode(email: string): string {
    const hash = crypto.createHash('sha256').update(email).digest('hex');
    const shortHash = hash.substring(0, 8);
    const random = Math.random().toString(36).substring(2, 6);
    return `${shortHash}-${random}`.toUpperCase();
  }

  // Generates a ticket for each participant in a given order.
  async generateTicketsForOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { participants: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    const generatedTickets = await Promise.all(
      order.participants.map((participant) =>
        this.prisma.generatedTicket.create({
          data: {
            ticketCode: this.generateTicketCode(participant.email ?? ''),
            participantId: participant.id,
            orderId: order.id,
          },
        }),
      ),
    );

    return generatedTickets;
  }
}
