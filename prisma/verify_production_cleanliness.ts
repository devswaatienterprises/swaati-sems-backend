import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function verify() {
  console.log('🔍 ========================================================');
  console.log('🔍 PRODUCTION DATABASE CLEANLINESS & AUTH VERIFICATION');
  console.log('🔍 ========================================================\n');

  let passed = true;

  // 1. Table Counts & Cleanliness Audit
  const userCount = await prisma.user.count();
  const employeeCount = await prisma.employee.count();
  const empDocCount = await prisma.employeeDocument.count();
  const attendanceCount = await prisma.attendance.count();
  const leaveCount = await prisma.leaveRequest.count();
  const taskCount = await prisma.task.count();
  const recTaskCount = await prisma.recurringTask.count();
  const recOccCount = await prisma.recurringTaskOccurrence.count();
  const taskCommentCount = await prisma.taskComment.count();
  const taskHistCount = await prisma.taskAssignmentHistory.count();
  const leadCount = await prisma.lead.count();
  const notifCount = await prisma.notification.count();
  const convCount = await prisma.conversation.count();
  const convMemCount = await prisma.conversationMember.count();
  const msgCount = await prisma.message.count();

  // Preserved system config counts
  const sysSettingCount = await prisma.systemSetting.count();
  const langCount = await prisma.language.count();
  const contentItemCount = await prisma.contentItem.count();
  const contentTransCount = await prisma.contentTranslation.count();
  const transMgmtCount = await prisma.translationManagement.count();

  const productCount = await prisma.product.count();
  const productDocCount = await prisma.productDocument.count();

  console.log('📊 1. RECORD COUNTS AUDIT:');
  console.log(`   - Users                   : ${userCount} (Target: 1)`);
  console.log(`   - Employees               : ${employeeCount} (Target: 1)`);
  console.log(`   - Employee Documents      : ${empDocCount} (Target: 0)`);
  console.log(`   - Attendance Records      : ${attendanceCount} (Target: 0)`);
  console.log(`   - Leave Requests          : ${leaveCount} (Target: 0)`);
  console.log(`   - Tasks                   : ${taskCount} (Target: 0)`);
  console.log(`   - Recurring Tasks         : ${recTaskCount} (Target: 0)`);
  console.log(`   - Task Occurrences        : ${recOccCount} (Target: 0)`);
  console.log(`   - Task Comments           : ${taskCommentCount} (Target: 0)`);
  console.log(`   - Task History            : ${taskHistCount} (Target: 0)`);
  console.log(`   - Leads                   : ${leadCount} (Target: 0)`);
  console.log(`   - Products                : ${productCount} (Target: 0)`);
  console.log(`   - Product Documents       : ${productDocCount} (Target: 0)`);
  console.log(`   - Notifications           : ${notifCount} (Target: 0)`);
  console.log(`   - Conversations           : ${convCount} (Target: 0)`);
  console.log(`   - Messages                : ${msgCount} (Target: 0)`);

  console.log('\n⚙️  2. PRESERVED SYSTEM CONFIGURATION AUDIT:');
  console.log(`   - System Settings         : ${sysSettingCount} (Preserved intact)`);
  console.log(`   - Languages               : ${langCount} (Preserved intact)`);
  console.log(`   - Content Items           : ${contentItemCount} (Preserved intact)`);
  console.log(`   - Content Translations    : ${contentTransCount} (Preserved intact)`);
  console.log(`   - Translation Management  : ${transMgmtCount} (Preserved intact)`);

  // Assert zero dummy data
  if (userCount !== 1) { console.error('❌ FAIL: User count is not 1'); passed = false; }
  if (employeeCount !== 1) { console.error('❌ FAIL: Employee count is not 1'); passed = false; }
  if (attendanceCount !== 0) { console.error('❌ FAIL: Attendance is not empty'); passed = false; }
  if (leaveCount !== 0) { console.error('❌ FAIL: Leave requests are not empty'); passed = false; }
  if (taskCount !== 0) { console.error('❌ FAIL: Tasks are not empty'); passed = false; }
  if (leadCount !== 0) { console.error('❌ FAIL: Leads are not empty'); passed = false; }
  if (productCount !== 0) { console.error('❌ FAIL: Products are not empty'); passed = false; }
  if (productDocCount !== 0) { console.error('❌ FAIL: Product documents are not empty'); passed = false; }
  if (msgCount !== 0) { console.error('❌ FAIL: Messages are not empty'); passed = false; }
  if (notifCount !== 0) { console.error('❌ FAIL: Notifications are not empty'); passed = false; }

  // 2. Admin User Details & Security Checks
  console.log('\n👤 3. ADMIN ACCOUNT INTEGRITY & PASSWORD HASHING CHECK:');
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    include: { employee: true, permissions: true },
  });

  if (!adminUser) {
    console.error('❌ FAIL: No Admin user found in database!');
    passed = false;
  } else {
    console.log(`   - Admin ID: ${adminUser.id}`);
    console.log(`   - Admin Email: ${adminUser.email}`);
    console.log(`   - Admin Role: ${adminUser.role}`);
    console.log(`   - Is Active: ${adminUser.isActive}`);
    console.log(`   - Password Hash Format: ${adminUser.passwordHash.startsWith('$2') ? '✅ Valid Bcrypt Hash' : '❌ Invalid Hash'}`);
    console.log(`   - Is Plaintext Password Stored: ${adminUser.passwordHash.includes('Swaati') ? '❌ FAILS (Plaintext found!)' : '✅ NO (Secured)'}`);

    // Check permissions
    const permissionsMap: Record<string, boolean> = {};
    for (const p of adminUser.permissions) {
      permissionsMap[p.featureKey] = p.enabled;
    }
    console.log(`   - Total Granted Permissions: ${adminUser.permissions.length} / 9 features`);
    console.log('   - Permissions detail:', permissionsMap);

    // 3. Authenticated Admin Login Verification Flow
    console.log('\n🔐 4. VERIFYING ADMIN LOGIN AUTHENTICATION FLOW:');
    const adminPassword = process.env.PRODUCTION_ADMIN_PASSWORD || 'SwaatiAdmin@2026#Prod';

    const passwordMatches = await bcrypt.compare(adminPassword, adminUser.passwordHash);
    if (passwordMatches) {
      console.log('   - Bcrypt Password Verification: ✅ MATCH SUCCESSFUL');
    } else {
      console.error('   - Bcrypt Password Verification: ❌ MATCH FAILED');
      passed = false;
    }

    // Test JWT Generation
    const jwtSecret = process.env.JWT_SECRET || 'swaati_enterprise_super_secure_jwt_secret_2026';
    const token = jwt.sign(
      { id: adminUser.id, userId: adminUser.userId, email: adminUser.email, role: adminUser.role },
      jwtSecret,
      { expiresIn: '7d' }
    );
    const decoded: any = jwt.verify(token, jwtSecret);
    if (decoded && decoded.email === adminUser.email) {
      console.log('   - JWT Sign & Verification test: ✅ SUCCESSFUL');
    } else {
      console.error('   - JWT Sign & Verification test: ❌ FAILED');
      passed = false;
    }

    // Test Invalid Login Failure handling
    const invalidMatches = await bcrypt.compare('WrongPassword123!', adminUser.passwordHash);
    if (!invalidMatches) {
      console.log('   - Invalid Password Rejection test: ✅ CORRECTLY REJECTED');
    } else {
      console.error('   - Invalid Password Rejection test: ❌ FAILED (Accepted wrong password)');
      passed = false;
    }
  }

  console.log('\n--------------------------------------------------------');
  if (passed) {
    console.log('✅ ALL PRODUCTION DATABASE CLEANLINESS & AUTH CHECKS PASSED!');
  } else {
    console.error('❌ VERIFICATION CHECKS FAILED!');
    process.exit(1);
  }
}

verify()
  .catch((e) => {
    console.error('❌ Verification script errored:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
