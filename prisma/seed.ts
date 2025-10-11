import { PrismaClient } from '../generated/prisma'; // Import from generated folder

const prisma = new PrismaClient();

async function main() {
  // 1️⃣ Create tickets
  const earlybirdTicket = await prisma.ticket.create({
    data: {
      title: "Earlybird Ticket",
      description: "Discounted entry for early buyers",
      type: "earlybird",
      price: 40,
      quantity: 100,
    },
  });

  const standardTicket = await prisma.ticket.create({
    data: {
      title: "Standard Ticket",
      description: "Regular entry",
      type: "standard",
      price: 60,
      quantity: 50,
    },
  });

  // 2️⃣ Create users
  const alice = await prisma.user.create({
    data: { name: "Alice", email: "alice@example.com" },
  });

  const bob = await prisma.user.create({
    data: { name: "Bob", email: "bob@example.com" },
  });

  // 3️⃣ Create Order 1 → 1 Earlybird ticket for Alice
  const order1 = await prisma.order.create({
    data: {
      userId: alice.id,
      totalAmount: 40,
      ticketCount: 1,
      ticketType: "earlybird",
      paymentId: "rzp_test_001",
      provider: "razorpay",
      status: "success",
      orderItems: {
        create: [
          { participantName: "Alice", participantEmail: "alice@example.com" },
        ],
      },
    },
    include: { orderItems: true },
  });

  // 4️⃣ Create Order 2 → 3 Earlybird tickets for Bob
  const order2 = await prisma.order.create({
    data: {
      userId: bob.id,
      totalAmount: 120,
      ticketCount: 3,
      ticketType: "earlybird",
      paymentId: "rzp_test_002",
      provider: "daimo",
      status: "success",
      orderItems: {
        create: [
          { participantName: "Bob", participantEmail: "bob@example.com" },
          { participantName: "Charlie", participantEmail: "charlie@example.com" },
          { participantName: "David", participantEmail: "david@example.com" },
        ],
      },
    },
    include: { orderItems: true },
  });

  console.log("Seed completed!");
  console.log({ order1, order2 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
