import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const prods = await p.product.findMany();
  console.log('Database product count:', prods.length);
  console.log(JSON.stringify(prods, null, 2));

  const docs = await p.productDocument.findMany();
  console.log('Database product document count:', docs.length);
  console.log(JSON.stringify(docs, null, 2));
}

main().catch(console.error).finally(() => p.$disconnect());
