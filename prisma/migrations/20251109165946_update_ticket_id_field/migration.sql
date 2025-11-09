/*
  Warnings:

  - You are about to drop the column `ticketId` on the `Order` table. All the data in the column will be lost.
  - Added the required column `ticketType` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Order" DROP CONSTRAINT "Order_ticketId_fkey";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "ticketId",
ADD COLUMN     "ticketType" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_ticketType_fkey" FOREIGN KEY ("ticketType") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
