import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetAdminPassword() {
  console.log('🔄 Resetting password for admin@swaatienterprises.in to Admin@123...');

  const email = 'admin@swaatienterprises.in';
  const newPassword = 'Admin@123';
  const passwordHash = await bcrypt.hash(newPassword, 10);

  const existingAdmin = await prisma.user.findFirst({
    where: { email },
    include: { permissions: true },
  });

  if (!existingAdmin) {
    throw new Error(`Admin user ${email} not found in database!`);
  }

  // Update password and ensure active status
  await prisma.user.update({
    where: { id: existingAdmin.id },
    data: {
      passwordHash,
      isActive: true,
      role: 'ADMIN',
    },
  });

  // Ensure all 9 system permissions are set to true
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
    await prisma.userPermission.upsert({
      where: {
        userId_featureKey: {
          userId: existingAdmin.id,
          featureKey,
        },
      },
      update: { enabled: true },
      create: {
        userId: existingAdmin.id,
        featureKey,
        enabled: true,
        updatedBy: 'system_password_reset',
      },
    });
  }

  console.log('✅ Admin password updated to Admin@123 cleanly in database.');
}

resetAdminPassword()
  .catch((err) => {
    console.error('❌ Reset failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
