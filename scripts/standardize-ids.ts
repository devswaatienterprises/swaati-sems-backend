import { prisma } from '../src/config/db';

async function standardize() {
  console.log('=== STARTING SEMS ID STANDARDIZATION & MIGRATION ===\n');

  // 1. Add leave_code column to leave_requests if not present
  console.log('1. Ensuring leave_code column exists in leave_requests...');
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "leave_code" VARCHAR(50);`
  );

  // 2. Standardize Employees (EMP-001, EMP-002, ...)
  console.log('\n2. Standardizing Employee IDs...');
  const employees = await prisma.employee.findMany({
    orderBy: { createdAt: 'asc' },
  });

  for (let i = 0; i < employees.length; i++) {
    const newCode = `EMP-${String(i + 1).padStart(3, '0')}`;
    console.log(`  Updating Employee ${employees[i].name} (${employees[i].employeeCode}) -> ${newCode}`);
    await prisma.employee.update({
      where: { id: employees[i].id },
      data: { employeeCode: newCode },
    });
  }

  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS employee_code_seq START WITH 1 INCREMENT BY 1;`
  );
  if (employees.length > 0) {
    await prisma.$executeRawUnsafe(
      `SELECT setval('employee_code_seq', ${employees.length}, true);`
    );
  }

  // 3. Standardize Leads (LEAD-2026-001, LEAD-2026-002, ...)
  console.log('\n3. Standardizing Lead IDs...');
  const leads = await prisma.lead.findMany({
    orderBy: { createdAt: 'asc' },
  });

  for (let i = 0; i < leads.length; i++) {
    const year = leads[i].createdAt ? new Date(leads[i].createdAt).getFullYear() : 2026;
    const newCode = `LEAD-${year}-${String(i + 1).padStart(3, '0')}`;
    console.log(`  Updating Lead ${leads[i].leadName} (${leads[i].leadCode}) -> ${newCode}`);
    await prisma.lead.update({
      where: { id: leads[i].id },
      data: { leadCode: newCode },
    });
  }

  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS lead_code_2026_seq START WITH 1 INCREMENT BY 1;`
  );
  if (leads.length > 0) {
    await prisma.$executeRawUnsafe(
      `SELECT setval('lead_code_2026_seq', ${leads.length}, true);`
    );
  }

  // 4. Standardize Tasks (TSK-001, TSK-002, ...)
  console.log('\n4. Standardizing Task IDs...');
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: 'asc' },
  });

  for (let i = 0; i < tasks.length; i++) {
    const newCode = `TSK-${String(i + 1).padStart(3, '0')}`;
    console.log(`  Updating Task "${tasks[i].title}" (${tasks[i].taskCode}) -> ${newCode}`);
    await prisma.task.update({
      where: { id: tasks[i].id },
      data: { taskCode: newCode },
    });
  }

  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS task_code_seq START WITH 1 INCREMENT BY 1;`
  );
  if (tasks.length > 0) {
    await prisma.$executeRawUnsafe(
      `SELECT setval('task_code_seq', ${tasks.length}, true);`
    );
  }

  // 5. Standardize Leave Requests (LV-001, LV-002, ...)
  console.log('\n5. Standardizing Leave Request IDs...');
  const leaves = await prisma.$queryRawUnsafe<Array<{ id: string; leave_type: string }>>(
    `SELECT "id", "leave_type" FROM "leave_requests" ORDER BY "created_at" ASC;`
  );

  for (let i = 0; i < leaves.length; i++) {
    const newCode = `LV-${String(i + 1).padStart(3, '0')}`;
    console.log(`  Updating Leave Request ${leaves[i].id} (${leaves[i].leave_type}) -> ${newCode}`);
    await prisma.$executeRawUnsafe(
      `UPDATE "leave_requests" SET "leave_code" = $1 WHERE "id" = $2;`,
      newCode,
      leaves[i].id
    );
  }

  // Ensure default and NOT NULL constraint after populating
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "leave_requests" ALTER COLUMN "leave_code" SET NOT NULL;`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "leave_requests_leave_code_key" ON "leave_requests"("leave_code");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS leave_code_seq START WITH 1 INCREMENT BY 1;`
  );
  if (leaves.length > 0) {
    await prisma.$executeRawUnsafe(
      `SELECT setval('leave_code_seq', ${leaves.length}, true);`
    );
  }

  // 6. Standardize Products (PROD-001, PROD-002, ...)
  console.log('\n6. Standardizing Product IDs...');
  const products = await prisma.product.findMany({
    orderBy: { createdAt: 'asc' },
  });

  for (let i = 0; i < products.length; i++) {
    const newCode = `PROD-${String(i + 1).padStart(3, '0')}`;
    console.log(`  Updating Product "${products[i].name}" (${products[i].productCode}) -> ${newCode}`);
    await prisma.product.update({
      where: { id: products[i].id },
      data: { productCode: newCode },
    });
  }

  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS product_code_seq START WITH 1 INCREMENT BY 1;`
  );
  if (products.length > 0) {
    await prisma.$executeRawUnsafe(
      `SELECT setval('product_code_seq', ${products.length}, true);`
    );
  }

  console.log('\n=== STANDARDIZATION COMPLETE SUCCESSFULLY ===');
  await prisma.$disconnect();
}

standardize().catch((err) => {
  console.error('Standardization failed:', err);
  process.exit(1);
});
