/*
  Warnings:

  - You are about to drop the column `buyerEmail` on the `Cart` table. All the data in the column will be lost.
  - You are about to drop the column `buyerName` on the `Cart` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Participant` table. All the data in the column will be lost.
  - Added the required column `phone` to the `Participant` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Cart" DROP COLUMN "buyerEmail",
DROP COLUMN "buyerName";

-- AlterTable
ALTER TABLE "Participant" DROP COLUMN "createdAt",
ADD COLUMN     "isBuyer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT NOT NULL;
