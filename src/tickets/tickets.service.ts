import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as QRCode from 'qrcode';
import { MailService } from '../mail/mail.service';
import * as crypto from 'crypto';
import {
  getPngBufferFromDataUrl,
  savePngFromDataUrl,
} from 'src/utils/handle-png';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  //Generates a unique, non-reversible ticket code based on participant email + randomness
  private async generateTicketCode(): Promise<string> {
    while (true) {
      const code = crypto
        .randomBytes(4)
        .toString('hex')
        .substring(0, 6)
        .toUpperCase();

      const exists = await this.prisma.generatedTicket.findUnique({
        where: { ticketCode: code },
      });

      if (!exists) return code; // unique → return it
    }
  }

  // Generates a ticket for each participant in a given order.
  async generateTicketsForOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { participants: true },
    });

    if (!order) throw new NotFoundException('Order not found');

    const generatedTickets = await Promise.all(
      order.participants.map(async (participant) => {
        // Generate unique ticket code
        const ticketCode = await this.generateTicketCode();
        // Call QR generation function
        const { dataUrl, ticketUrl, qrHash } =
          await this.generateQRforTicket(ticketCode);
        // Create ticket entry
        await this.prisma.generatedTicket.create({
          data: {
            ticketCode: ticketCode,
            participantId: participant.id,
            qrHash: qrHash,
            qrUrl: ticketUrl,
            orderId: order.id,
          },
        });

        // convert dataURL → PNG file (example path)
        // const filePath = `./qr/tickets/${ticketCode}.png`;

        // Get PNG buffer for QR image
        // getPngBufferFromDataUrl(dataUrl);

        //for validation in dev with x-scanner-key
        console.log(ticketUrl);
      }),
    );

    await this.mailService.sendBuyerEmail(orderId);
    await this.mailService.sendParticipantEmails(orderId);

    return generatedTickets;
  }

  async generateQRforTicket(ticketCode: string) {
    // store ticketCode hash in DB for checkIn
    const qrHash = crypto.createHash('sha256').update(ticketCode).digest('hex');

    // build ticket URL and QR (embedded with ticketCode)
    const ticketUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/t/${ticketCode}`;

    // QR as base64
    const dataUrl = await QRCode.toDataURL(ticketUrl, {
      width: 200,
      errorCorrectionLevel: 'M',
    });

    return { dataUrl, ticketUrl, qrHash };
  }

  async verifyAndMark(token: string) {
    if (!token) throw new BadRequestException('token required');

    //get ticketCode hash
    const qrHash = crypto.createHash('sha256').update(token).digest('hex');

    const ticket = await this.prisma.generatedTicket.findFirst({
      where: { qrHash: qrHash },
    });

    //check if participant doesn't exist
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    //check if participant already checked-in
    if (ticket.checkedIn) {
      return { ok: false, reason: 'Participant is already checked in' };
    }

    // atomic update: only mark used when checkedIn = false
    const result = await this.prisma.generatedTicket.update({
      where: { qrHash: qrHash, checkedIn: false },
      data: { checkedIn: true },
    });

    if (result) {
      //get ticket type and buyer info
      const orderInfo = await this.prisma.order.findFirst({
        where: { id: result.orderId },
      });
      const ticketType = await this.prisma.ticket.findFirst({
        where: { id: orderInfo?.ticketId },
      });
      // get participant info
      const p = await this.prisma.participant.findFirst({
        where: { id: result.participantId },
      });
      if (!p) throw new NotFoundException('Invalid token');
      return {
        participantName: p?.name || 'Participant',
        ticketTypeTitle: ticketType?.title || 'Ticket',
        buyerName: orderInfo?.buyerName || 'Buyer',
      };
    }
  }
}
