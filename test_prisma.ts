// test-prisma.ts
import { PrismaClient } from 'generated/prisma';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log("Users:", users);

  const orders = await prisma.order.findMany({ include: { orderItems: true } });
  console.log("Orders:", orders);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
