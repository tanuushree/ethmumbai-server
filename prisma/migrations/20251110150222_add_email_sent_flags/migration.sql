-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "buyerEmailSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "buyerEmailSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "emailSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailSentAt" TIMESTAMP(3);
