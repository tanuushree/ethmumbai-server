import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(private prisma: PrismaService) {}

  async createCart(ticketId: number, quantity: number) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new Error('Ticket not found');

    const cart = await this.prisma.cart.create({
      data: {
        ticketId,
        quantity,
      },
    });

    return cart;
  }

  async addParticipants(
  cartId: string,
  participants: { name: string; email?: string; phone: string; isBuyer?: boolean }[],
) {
  const cart = await this.prisma.cart.findUnique({ where: { id: cartId } });
  if (!cart) throw new Error('Cart not found');

  if (participants.length !== cart.quantity) {
    throw new Error('Participant count must match ticket quantity');
  }

  const participantRecords = participants.map((p, index) => ({
    cartId,
    name: p.name,
    email: p.email || null,
    phone: p.phone,                  // required by Prisma
    isBuyer: p.isBuyer || index === 0, // mark first participant as buyer if not provided
  }));

  await this.prisma.participant.createMany({ data: participantRecords });

  return { cartId, status: 'buyer_info_saved' };
}

}
