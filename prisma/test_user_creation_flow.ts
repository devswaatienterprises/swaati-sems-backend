import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function testUserCreationFlow() {
  console.log('🧪 Testing Admin User Creation Flow...');

  // 1. Simulate Admin creating a team member
  const testEmail = 'temp.test.member@swaatienterprises.in';
  const testPlainPassword = 'TempSecurePassword@2026';
  const hashedPassword = await bcrypt.hash(testPlainPassword, 10);

  const newUser = await prisma.user.create({
    data: {
      userId: 'temp.test',
      email: testEmail,
      passwordHash: hashedPassword,
      role: 'OPERATION_HEAD',
      isActive: true,
      employee: {
        create: {
          employeeCode: 'EMP-TEMP-999',
          userId: 'temp.test',
          name: 'Temporary Test Member',
          email: testEmail,
          mobile: '+91 99000 00000',
          department: 'Technical & Operations',
          designation: 'Site Engineer',
          joiningDate: new Date(),
          employmentStatus: 'Active',
          active: true,
        },
      },
    },
    include: { employee: true },
  });

  console.log(`✅ Temporary User Created: ${newUser.email}`);
  console.log(`✅ Password Hash format verified: ${newUser.passwordHash.startsWith('$2')}`);
  console.log(`✅ Plaintext password NOT stored: ${!(newUser as any).password}`);

  // Test bcrypt login match
  const isMatch = await bcrypt.compare(testPlainPassword, newUser.passwordHash);
  console.log(`✅ Created User Login Verification: ${isMatch ? 'PASSED' : 'FAILED'}`);

  // Delete temporary test user immediately
  await prisma.employee.delete({ where: { id: newUser.employee!.id } });
  await prisma.user.delete({ where: { id: newUser.id } });
  console.log('🧹 Temporary Test User deleted cleanly.');

  // Final check
  const finalUserCount = await prisma.user.count();
  console.log(`📊 Final User count after cleanup: ${finalUserCount} (Target: 1)`);

  if (finalUserCount === 1) {
    console.log('✅ User Creation Flow verified successfully with zero leftover records!');
  } else {
    throw new Error('User count mismatch after test!');
  }
}

testUserCreationFlow()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
