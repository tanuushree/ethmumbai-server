/*
  Warnings:

  - A unique constraint covering the columns `[qrHash]` on the table `GeneratedTicket` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `qrHash` to the `GeneratedTicket` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "GeneratedTicket" ADD COLUMN     "checkedIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "qrHash" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedTicket_qrHash_key" ON "GeneratedTicket"("qrHash");
