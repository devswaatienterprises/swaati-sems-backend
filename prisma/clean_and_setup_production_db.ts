import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from backend/.env
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 ========================================================');
  console.log('🧹 STARTING SWAATI ENTERPRISES PRODUCTION DB CLEANUP & SETUP');
  console.log('🧹 ========================================================\n');

  const adminEmail = (process.env.PRODUCTION_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@swaatienterprises.in').trim().toLowerCase();
  const adminPassword = process.env.PRODUCTION_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'SwaatiAdmin@2026#Prod';

  if (!adminEmail || !adminPassword) {
    throw new Error('FATAL: Admin email and password must be configured in environment variables.');
  }

  console.log(`📌 Admin Email target: ${adminEmail}`);

  // 1. Hash Admin Password securely using bcrypt salt round 10
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  // 2. Delete all dummy / test operational records while preserving FK constraints
  console.log('🗑️  1. Purging dummy operational records...');

  const deletedTaskComments = await prisma.taskComment.deleteMany({});
  console.log(`   - Deleted TaskComments: ${deletedTaskComments.count}`);

  const deletedTaskHistory = await prisma.taskAssignmentHistory.deleteMany({});
  console.log(`   - Deleted TaskAssignmentHistories: ${deletedTaskHistory.count}`);

  const deletedOccurrences = await prisma.recurringTaskOccurrence.deleteMany({});
  console.log(`   - Deleted RecurringTaskOccurrences: ${deletedOccurrences.count}`);

  const deletedTasks = await prisma.task.deleteMany({});
  console.log(`   - Deleted Tasks: ${deletedTasks.count}`);

  const deletedRecurringTasks = await prisma.recurringTask.deleteMany({});
  console.log(`   - Deleted RecurringTasks: ${deletedRecurringTasks.count}`);

  const deletedLeads = await prisma.lead.deleteMany({});
  console.log(`   - Deleted Leads: ${deletedLeads.count}`);

  const deletedAttendance = await prisma.attendance.deleteMany({});
  console.log(`   - Deleted Attendance records: ${deletedAttendance.count}`);

  const deletedLeaves = await prisma.leaveRequest.deleteMany({});
  console.log(`   - Deleted LeaveRequests: ${deletedLeaves.count}`);

  const deletedMessages = await prisma.message.deleteMany({});
  console.log(`   - Deleted Messages: ${deletedMessages.count}`);

  const deletedConvMembers = await prisma.conversationMember.deleteMany({});
  console.log(`   - Deleted ConversationMembers: ${deletedConvMembers.count}`);

  const deletedConversations = await prisma.conversation.deleteMany({});
  console.log(`   - Deleted Conversations: ${deletedConversations.count}`);

  const deletedNotifications = await prisma.notification.deleteMany({});
  console.log(`   - Deleted Notifications: ${deletedNotifications.count}`);

  const deletedDocRecords = await prisma.employeeDocument.deleteMany({});
  console.log(`   - Deleted EmployeeDocuments: ${deletedDocRecords.count}`);

  const deletedPermissions = await prisma.userPermission.deleteMany({});
  console.log(`   - Deleted UserPermissions: ${deletedPermissions.count}`);

  const deletedAuditLogs = await prisma.auditLog.deleteMany({});
  console.log(`   - Deleted AuditLogs: ${deletedAuditLogs.count}`);

  const deletedProductDocs = await prisma.productDocument.deleteMany({});
  console.log(`   - Deleted ProductDocuments: ${deletedProductDocs.count}`);

  const deletedProducts = await prisma.product.deleteMany({});
  console.log(`   - Deleted Products: ${deletedProducts.count}`);

  const deletedEmployees = await prisma.employee.deleteMany({});
  console.log(`   - Deleted Employees: ${deletedEmployees.count}`);

  const deletedUsers = await prisma.user.deleteMany({});
  console.log(`   - Deleted Users: ${deletedUsers.count}`);

  console.log('✅ Dummy operational records successfully purged.');

  // 3. Create single real production Admin User and linked Employee profile
  console.log('\n👤 2. Creating single real Production Admin account...');

  const adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      userId: 'admin',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      isActive: true,
      employee: {
        create: {
          employeeCode: 'EMP-101',
          userId: 'admin',
          name: 'Shailendra Patil',
          email: adminEmail,
          mobile: '+91 93700 11133',
          department: 'Executive Management',
          designation: 'Managing Director',
          joiningDate: new Date('2006-04-15'),
          employmentStatus: 'Active',
          active: true,
          avatar: 'SP',
          reportingManager: 'Board of Directors',
        },
      },
    },
    include: {
      employee: true,
    },
  });

  console.log(`✅ Production Admin User created with ID: ${adminUser.id}`);
  console.log(`✅ Production Admin Employee created with Code: ${adminUser.employee?.employeeCode}`);

  // 4. Create Granular System Permissions for Admin (All 9 Features Enabled)
  console.log('\n🔒 3. Setting up full Admin RBAC permissions matrix...');
  const allFeatures = [
    'dashboard',
    'attendance',
    'leave',
    'tasks',
    'leads',
    'products',
    'reports',
    'notifications',
    'messaging',
  ];

  for (const featureKey of allFeatures) {
    await prisma.userPermission.create({
      data: {
        userId: adminUser.id,
        featureKey,
        enabled: true,
        updatedBy: 'system_setup',
      },
    });
  }

  console.log(`✅ Permissions granted for ${allFeatures.length} features.`);

  // 5. Audit logs for setup
  await prisma.auditLog.create({
    data: {
      actorUserId: adminUser.id,
      action: 'PRODUCTION_DATABASE_CLEANUP_AND_ADMIN_SETUP',
      entityType: 'User',
      entityId: adminUser.id,
      metadata: JSON.stringify({
        cleanedAt: new Date().toISOString(),
        adminEmail,
        status: 'SUCCESS',
      }),
    },
  });

  console.log('\n🎉 PRODUCTION DATABASE CLEANUP & SETUP COMPLETE!');
}

main()
  .catch((e) => {
    console.error('❌ Production Database Setup failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
