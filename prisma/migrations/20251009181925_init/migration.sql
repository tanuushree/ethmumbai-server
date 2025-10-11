/*
  Warnings:

  - You are about to drop the column `ticketId` on the `OrderTicket` table. All the data in the column will be lost.
  - Added the required column `ticketType` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."OrderTicket" DROP CONSTRAINT "OrderTicket_ticketId_fkey";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "ticketType" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "OrderTicket" DROP COLUMN "ticketId";
