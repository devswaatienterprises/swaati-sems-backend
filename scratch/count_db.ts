import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  console.log('--- DATABASE RECORD COUNTS ---');
  console.log('users:', await p.user.count());
  console.log('employees:', await p.employee.count());
  console.log('employeeDocuments:', await p.employeeDocument.count());
  console.log('attendance:', await p.attendance.count());
  console.log('leaveRequests:', await p.leaveRequest.count());
  console.log('tasks:', await p.task.count());
  console.log('recurringTasks:', await p.recurringTask.count());
  console.log('leads:', await p.lead.count());
  console.log('products:', await p.product.count());
  console.log('productDocuments:', await p.productDocument.count());
  console.log('notifications:', await p.notification.count());
  console.log('conversations:', await p.conversation.count());
  console.log('messages:', await p.message.count());
  console.log('systemSettings:', await p.systemSetting.count());
  console.log('auditLogs:', await p.auditLog.count());
  console.log('translationsManagement:', await p.translationManagement.count());

  console.log('\n--- SAMPLE USERS (ROLES & CODES) ---');
  const users = await p.user.findMany({
    select: { id: true, userId: true, email: true, role: true, isActive: true, employee: { select: { name: true, employeeCode: true, department: true } } }
  });
  console.log(JSON.stringify(users, null, 2));
}

main().catch(console.error).finally(() => p.$disconnect());
