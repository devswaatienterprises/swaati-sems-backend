import { prisma } from '../src/config/db';

async function audit() {
  console.log('=== AUDITING DATABASE ENTITIES & IDS ===\n');

  // 1. Employees
  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, userId: true, name: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Employees count: ${employees.length}`);
  employees.forEach(e => console.log(`  - PK: ${e.id} | code: ${e.employeeCode} | userId: ${e.userId} | name: ${e.name}`));

  // 2. Leads
  const leads = await prisma.lead.findMany({
    select: { id: true, leadCode: true, leadName: true, source: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`\nLeads count: ${leads.length}`);
  leads.forEach(l => console.log(`  - PK: ${l.id} | code: ${l.leadCode} | name: ${l.leadName} | source: ${l.source} | created: ${l.createdAt?.toISOString()}`));

  // 3. Tasks
  const tasks = await prisma.task.findMany({
    select: { id: true, taskCode: true, title: true, assignedToId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`\nTasks count: ${tasks.length}`);
  tasks.forEach(t => console.log(`  - PK: ${t.id} | code: ${t.taskCode} | title: ${t.title}`));

  // 4. Leave Requests
  const leaves = await prisma.leaveRequest.findMany({
    select: { id: true, employeeId: true, leaveType: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`\nLeave requests count: ${leaves.length}`);
  leaves.forEach(l => console.log(`  - PK: ${l.id} | empId: ${l.employeeId} | type: ${l.leaveType} | status: ${l.status}`));

  // 5. Products
  const products = await prisma.product.findMany({
    select: { id: true, productCode: true, name: true, category: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`\nProducts count: ${products.length}`);
  products.forEach(p => console.log(`  - PK: ${p.id} | code: ${p.productCode} | name: ${p.name}`));

  // 6. Audit Logs referencing codes/ids
  const auditLogs = await prisma.auditLog.findMany({
    select: { id: true, entityType: true, entityId: true, action: true, metadata: true },
    take: 20,
    orderBy: { createdAt: 'desc' },
  });
  console.log(`\nRecent Audit Logs sample count: ${auditLogs.length}`);
  auditLogs.forEach(a => console.log(`  - PK: ${a.id} | entityType: ${a.entityType} | entityId: ${a.entityId} | action: ${a.action}`));

  await prisma.$disconnect();
}

audit().catch(e => {
  console.error(e);
  process.exit(1);
});
