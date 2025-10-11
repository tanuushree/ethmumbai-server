import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tickets = [
    {
      title: 'Early Bird',
      type: 'earlybird',
      price: 999,
      quantity: 100, 
    },
    {
      title: 'Standard',
      type: 'standard',
      price: 1999,
      quantity: 500,
    },
  ];

  for (const ticket of tickets) {
    await prisma.ticket.upsert({
      where: { title: ticket.title },
      update: {
        price: ticket.price,
        quantity: ticket.quantity,
      },
      create: ticket,
    });
  }

  console.log('Tickets seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
