import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  console.log('departments:', await p.department.count());
  console.log('roles:', await p.role.count());
  console.log('userPermissions:', await p.userPermission.count());
  console.log('languages:', await p.language.count());
  console.log('contentItems:', await p.contentItem.count());
  console.log('contentTranslations:', await p.contentTranslation.count());
  console.log('contentVersions:', await p.contentVersion.count());
}

main().catch(console.error).finally(() => p.$disconnect());
