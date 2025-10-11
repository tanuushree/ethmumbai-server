/*
  Warnings:

  - A unique constraint covering the columns `[title]` on the table `Ticket` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Ticket_title_key" ON "Ticket"("title");
