-- AlterTable
ALTER TABLE "GeneratedTicket" ADD COLUMN     "checkedInBy" TEXT,
ADD COLUMN     "merchReceived" BOOLEAN NOT NULL DEFAULT false;
