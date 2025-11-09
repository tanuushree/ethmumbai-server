/*
  Warnings:

  - The primary key for the `Order` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Participant` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Ticket` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[email]` on the table `Participant` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."Order" DROP CONSTRAINT "Order_ticketId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Participant" DROP CONSTRAINT "Participant_orderId_fkey";

-- AlterTable
ALTER TABLE "Order" DROP CONSTRAINT "Order_pkey",
ADD COLUMN     "razorpaySignature" TEXT,
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "ticketId" SET DATA TYPE TEXT,
ADD CONSTRAINT "Order_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Order_id_seq";

-- AlterTable
ALTER TABLE "Participant" DROP CONSTRAINT "Participant_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "orderId" SET DATA TYPE TEXT,
ADD CONSTRAINT "Participant_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Participant_id_seq";

-- AlterTable
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Ticket_id_seq";

-- CreateTable
CREATE TABLE "GeneratedTicket" (
    "id" TEXT NOT NULL,
    "ticketCode" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,

    CONSTRAINT "GeneratedTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedTicket_ticketCode_key" ON "GeneratedTicket"("ticketCode");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedTicket_participantId_key" ON "GeneratedTicket"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_email_key" ON "Participant"("email");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedTicket" ADD CONSTRAINT "GeneratedTicket_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedTicket" ADD CONSTRAINT "GeneratedTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
