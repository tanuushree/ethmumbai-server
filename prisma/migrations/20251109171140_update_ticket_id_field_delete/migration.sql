/*
  Warnings:

  - You are about to drop the column `ticketType` on the `Order` table. All the data in the column will be lost.
  - Added the required column `ticketId` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Order" DROP CONSTRAINT "Order_ticketType_fkey";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "ticketType",
ADD COLUMN     "ticketId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
