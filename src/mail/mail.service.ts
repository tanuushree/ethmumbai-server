import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { LoopsService } from './loops.service';
// import { Ticket } from 'generated/prisma';
// import { TicketsService } from '../tickets/tickets.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private prisma: PrismaService,
    private loops: LoopsService,
    // private ticketService: TicketsService,
  ) {}

  // ---------------------------------------------
  // BUYER CONFIRMATION EMAIL
  // ---------------------------------------------
  async sendBuyerEmail(
    orderId: string,
    pdfBuffer: Buffer, // Invoice PDF buffer
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: true,
        participants: { include: { generatedTicket: true } },
      },
    });

    if (!order) {
      this.logger.error(`Order not found: ${orderId}`);
      return;
    }

    if (order.buyerEmailSent) {
      this.logger.warn(`Buyer email already sent for ${order.id}`);
      return;
    }

    const BUYER_TEMPLATE = process.env.LOOPS_BUYER_EMAIL_ID;
    if (!BUYER_TEMPLATE) {
      this.logger.error('Missing env: LOOPS_BUYER_EMAIL_ID');
      return;
    }

    const participantsList = order.participants
      .map(
        (p) =>
          `${p.firstName} (${p.email}) - Ticket: ${p.generatedTicket?.ticketCode ?? 'Pending'}`,
      )
      .join('\n');

    const attachment = {
      filename: `ETHMumbai-Invoice-${order.invoiceNumber}.pdf`,
      contentType: 'application/pdf',
      data: pdfBuffer.toString('base64'),
    };

    const resp = await this.loops.sendTransactionalEmail(
      BUYER_TEMPLATE,
      order.buyer.email,
      {
        buyerName: order.buyer.firstName,
        orderId: order.id,
        paymentId: order.razorpayPaymentId ?? order.daimoPaymentId ?? 'N/A',
        amount: order.amount.toString(),
        currency: order.currency,
        status: order.status,
        participantsList,
      },
      [attachment],
    );

    if (!resp?.success) {
      this.logger.error(
        `Failed to send buyer confirmation → ${order.buyer.email}`,
      );
      return;
    }

    await this.prisma.order.update({
      where: { id: order.id },
      data: { buyerEmailSent: true, buyerEmailSentAt: new Date() },
    });

    this.logger.log(`Buyer email sent → ${order.buyer.email}`);
  }

  async sendBuyerCryptoEmail(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: true,
        participants: { include: { generatedTicket: true } },
      },
    });

    if (!order) {
      this.logger.error(`Order not found: ${orderId}`);
      return;
    }

    if (order.buyerEmailSent) {
      this.logger.warn(`Buyer email already sent for ${order.id}`);
      return;
    }

    const BUYER_TEMPLATE = process.env.LOOPS_BUYER_EMAIL_ID;
    if (!BUYER_TEMPLATE) {
      this.logger.error('Missing env: LOOPS_BUYER_EMAIL_ID');
      return;
    }

    const participantsList = order.participants
      .map(
        (p) =>
          `${p.firstName} (${p.email}) - Ticket: ${p.generatedTicket?.ticketCode ?? 'Pending'}`,
      )
      .join('\n');

    const resp = await this.loops.sendTransactionalEmail(
      BUYER_TEMPLATE,
      order.buyer.email,
      {
        buyerName: order.buyer.firstName,
        orderId: order.id,
        paymentId: order.razorpayPaymentId ?? order.daimoPaymentId ?? 'N/A',
        amount: order.amount.toString(),
        currency: order.currency,
        status: order.status,
        participantsList,
      },
    );

    if (!resp?.success) {
      this.logger.error(
        `Failed to send buyer confirmation → ${order.buyer.email}`,
      );
      return;
    }

    await this.prisma.order.update({
      where: { id: order.id },
      data: { buyerEmailSent: true, buyerEmailSentAt: new Date() },
    });

    this.logger.log(`Buyer email sent → ${order.buyer.email}`);
  }

  // ---------------------------------------------
  // PARTICIPANT TICKET EMAILS (with QR attachment)
  // ---------------------------------------------
  async sendParticipantEmails(
    orderId: string,
    pdfMap: Map<string, Buffer>, // ticketCode → PDF buffer
    pngMap: Map<string, Buffer> // ticketCode → PNG buffer
  ) {
    const participants = await this.prisma.participant.findMany({
      where: { orderId, emailSent: false },
      include: { generatedTicket: true },
    });

    if (!participants.length) {
      this.logger.warn(`No participants pending email for order ${orderId}`);
      return;
    }

    const templateId = process.env.LOOPS_PARTICIPANT_EMAIL_PNG_ID;
    if (!templateId) {
      this.logger.error('Missing env: LOOPS_PARTICIPANT_EMAIL_PNG_ID');
      return;
    }

    for (const p of participants) {
      if (!p.email) continue;

      const ticketCode = p.generatedTicket?.ticketCode;
      if (!ticketCode) continue;

      const pdfBuffer = pdfMap.get(ticketCode);
      if (!pdfBuffer) {
        this.logger.error(`Missing PDF buffer for ticket ${ticketCode}`);
        continue;
      }

      const pngBuffer = pngMap.get(ticketCode);
      if (!pngBuffer) {
        this.logger.error(`Missing PNG buffer for ticket ${ticketCode}`);
        continue;
      }

      const pngAttachment = {
        filename: `ETHMumbai-Ticket-${p.firstName}.png`,
        contentType: 'image/png',
        data: pngBuffer.toString('base64'),
      };
      const tweetText = encodeURIComponent(
        `I'm attending @ethmumbai 2026 🥳
\n\nBEST Ethereum Conference in Mumbai on 12th March 2026 with 50 speakers & 500 participants. See you there!`,
      );

      const attachment = {
        filename: `ETHMumbai-Ticket-${ticketCode}.pdf`,
        contentType: 'application/pdf',
        data: pdfBuffer.toString('base64'),
      };

      const resp = await this.loops.sendTransactionalEmail(
        templateId,
        p.email,
        {
          name: p.firstName,
          orderId,
          ticketCode,
          tweetText: tweetText,
        },
        [attachment, pngAttachment],
      );

      if (!resp?.success) {
        this.logger.error(`Failed sending ticket → ${p.email}`);
        continue;
      }

      // Mark as sent
      await this.prisma.participant.update({
        where: { id: p.id },
        data: { emailSent: true, emailSentAt: new Date() },
      });

      this.logger.log(`Ticket PDF sent → ${p.email}`);
    }
  }

  async sendParticipantEmailsWithPng(
    firstName: string,
    email: string,
    pngBuffer: Buffer) {
    // const participant = await this.prisma.participant.findFirst({
    //   where: { email },
    //   include: { order: true },
    // });

    // if (!participant) {
    //   this.logger.warn(`No participant found with email: ${email}`);
    //   return;
    // }

    const templateId = process.env.LOOPS_SHARE_ON_X_EMAIL_ID;
    if (!templateId) {
      this.logger.error('Missing env: LOOPS_SHARE_ON_X_EMAIL_ID');
      return;
    }

    if (!firstName) {
      throw new BadRequestException('Missing firstName (f) parameter');
    }

    // const pngBuffer = (await this.ticketService.visualTicketGeneration(
    //   ticketType,
    //   participant.firstName,
    // )) as Buffer | undefined;

    if (!pngBuffer) {
      this.logger.error(`Missing PNG buffer for participant ${email}`);
      return;
    }

    const pngAttachment = {
      filename: `ETHMumbai-Ticket-${firstName}.png`,
      contentType: 'image/png',
      data: pngBuffer.toString('base64'),
    };
    const tweetText = encodeURIComponent(
      `I'm attending @ethmumbai 2026 🥳
\n\nBEST Ethereum Conference in Mumbai on 12th March 2026 with 50 speakers & 500 participants. See you there!`,
    );

    const resp = await this.loops.sendTransactionalEmail(
      templateId,
      email,
      {
        name: firstName,
        tweetText,
      },
      [pngAttachment],
    );

    if (!resp?.success) {
      this.logger.error(`Failed sending ticket → ${email}`);
      return;
    }

    this.logger.log(`Ticket PDF sent → ${email}`);
    // }
  }

  async sendHackerEmailsWithPng(
    firstName: string,
    email: string,
    pngBuffer: Buffer) {


    const templateId = process.env.LOOPS_SHARE_ON_X_HACKER_EMAIL_ID;
    if (!templateId) {
      this.logger.error('Missing env: LOOPS_SHARE_ON_X_HACKER_EMAIL_ID');
      return;
    }


    const pngAttachment = {
      filename: `ETHMumbai-Hacker-${firstName}.png`,
      contentType: 'image/png',
      data: pngBuffer.toString('base64'),
    };
    const tweetText = encodeURIComponent(
      `I'm hacking at @ethmumbai❤️‍🔥\n\nCan't wait to build at the BEST Ethereum hackathon from 13th – 15th March 2026 on DeFi, Privacy & AI tracks.`,
    );

    const resp = await this.loops.sendTransactionalEmail(
      templateId,
      email,
      {
        name: firstName,
        tweetText: tweetText,
      },
      [pngAttachment],
    );

    if (!resp?.success) {
      this.logger.error(`Failed sending Hacker pass → ${email}`);
      return;
    }

    this.logger.log(`Hacker PDF sent → ${email}`);
    // }
  }

  async sendSingleParticipantEmail(
    input: {
      firstName?: string;
      email: string;
      ticketCode: string;
    },
    pdfMap: Map<string, Buffer>, // ticketCode → PDF buffer
  ) {
    const { firstName, email, ticketCode } = input;

    if (!email || !ticketCode) {
      this.logger.warn('Missing email or ticketCode');
      return;
    }

    const templateId = process.env.LOOPS_PARTICIPANT_EMAIL_ID;
    if (!templateId) {
      this.logger.error('Missing env: LOOPS_PARTICIPANT_EMAIL_ID');
      return;
    }

    const pdfBuffer = pdfMap.get(ticketCode);
    if (!pdfBuffer) {
      this.logger.error(`Missing PDF buffer for ticket ${ticketCode}`);
      return;
    }
    console.log(ticketCode);

    const attachment = {
      filename: `ETHMumbai-Ticket-${ticketCode}.pdf`,
      contentType: 'application/pdf',
      data: pdfBuffer.toString('base64'),
    };

    const resp = await this.loops.sendTransactionalEmail(
      templateId,
      email,
      {
        name: firstName ?? '',
        ticketCode,
      },
      [attachment],
    );

    if (!resp?.success) {
      this.logger.error(`Failed sending ticket → ${email}`);
      return;
    }

    this.logger.log(`Ticket PDF sent → ${email}`);
  }
}
