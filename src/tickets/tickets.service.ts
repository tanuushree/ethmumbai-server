import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { encryptPayload, decryptPayload } from '../utils/ticket.utils';
import { savePngFromDataUrl } from 'src/utils/save-png';

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
      order.participants.map(async (participant) => {
        const ticketCode = this.generateTicketCode(participant.email ?? '');
        // Create ticket entry
        await this.prisma.generatedTicket.create({
          data: {
            ticketCode: ticketCode,
            participantId: participant.id,
            orderId: order.id,
          },
        });

        // Call QR generation function
        const { dataUrl, verifyUrl } =
          await this.generateQRforTicket(ticketCode);
        // convert dataURL → PNG file (example path)
        const filePath = `./qr/tickets/${ticketCode}.png`;

        savePngFromDataUrl(dataUrl, filePath);
        //for validation in dev with x-scanner-key
        console.log(verifyUrl);
      }),
    );

    return generatedTickets;
  }

  async generateQRforTicket(ticketCode: string) {
    // store ticketCode hash in DB for checkIn
    const qrHash = crypto.createHash('sha256').update(ticketCode).digest('hex');

    await this.prisma.generatedTicket.update({
      where: { ticketCode: ticketCode },
      data: { qrHash: qrHash },
    });

    const ticket = await this.prisma.generatedTicket.findFirst({
      where: { ticketCode: ticketCode },
    });

    //get ticketCode + participantId to encrypt the QR
    const payloadObj = {
      ticketCode: ticketCode,
      participantId: ticket?.participantId,
    };
    const payloadStr = JSON.stringify(payloadObj);
    const token = encryptPayload(payloadStr);

    // build verify URL and QR (embedded with encrypted token)
    const verifyUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/tickets/verify?token=${token}`;

    // QR as base64
    const dataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 200,
      errorCorrectionLevel: 'M',
    });

    // return img link, scannedUrl
    return { dataUrl, verifyUrl };
  }

  async verifyAndMark(token: string) {
    if (!token) throw new BadRequestException('token required');

    // decrypt the token -> ticketCode + participantId
    const json = decryptPayload(token);
    const data = JSON.parse(json);
    const { ticketCode, participantId } = data;

    //get ticketCode hash
    const qrHash = crypto.createHash('sha256').update(ticketCode).digest('hex');

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
      where: { qrHash: qrHash, participantId: participantId, checkedIn: false },
      data: { checkedIn: true },
    });

    if (result) {
      // check existence and display check in details
      const p = await this.prisma.participant.findFirst({
        where: { id: result.participantId },
      });
      if (!p) throw new NotFoundException('Invalid token');
      return 'Hello ' + p.name + '! Welcome to ETHMumbai.';
    }

    return 'Token Invalid' + token;
  }
}
