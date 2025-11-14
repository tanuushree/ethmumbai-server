/*
  Warnings:

  - You are about to drop the column `checkedIn` on the `GeneratedTicket` table. All the data in the column will be lost.
  - You are about to drop the column `checkedInAt` on the `GeneratedTicket` table. All the data in the column will be lost.
  - You are about to drop the column `qrHash` on the `GeneratedTicket` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."GeneratedTicket_qrHash_key";

-- AlterTable
ALTER TABLE "GeneratedTicket" DROP COLUMN "checkedIn",
DROP COLUMN "checkedInAt",
DROP COLUMN "qrHash";
