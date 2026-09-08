import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  console.log('🔄 Starting migration to translations_management table in Supabase PostgreSQL...');

  // Check if translations_management is a VIEW
  const tableCheck: any[] = await prisma.$queryRawUnsafe(`
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_name = 'translations_management'
  `);

  console.log('Relation check:', tableCheck);

  if (tableCheck.length > 0 && tableCheck[0].table_type === 'VIEW') {
    console.log('Dropping old read-only VIEW translations_management so it can be created as a real editable TABLE...');
    await prisma.$executeRawUnsafe(`DROP VIEW IF EXISTS "translations_management" CASCADE;`);
  }

  // 1. Create real table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "translations_management" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "alias" TEXT NOT NULL UNIQUE,
      "english" TEXT NOT NULL DEFAULT '',
      "marathi" TEXT NOT NULL DEFAULT '',
      "hindi" TEXT NOT NULL DEFAULT '',
      "module" TEXT NOT NULL DEFAULT 'global',
      "description" TEXT,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "translations_management_alias_idx" ON "translations_management"("alias");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "translations_management_module_idx" ON "translations_management"("module");
  `);

  console.log('✅ Real table translations_management verified/created successfully.');

  // 2. Fetch existing content items
  const items = await prisma.contentItem.findMany({
    include: {
      translations: {
        include: { language: true },
      },
    },
  });

  console.log(`📦 Found ${items.length} existing content items in content_items table.`);

  let insertedCount = 0;
  let updatedCount = 0;

  for (const item of items) {
    const alias = item.contentKey;
    const moduleName = item.module || 'global';
    const description = item.description || null;

    const enTrans = item.translations.find(
      (t) => t.language?.code === 'en' || t.languageId === 'en'
    );
    const mrTrans = item.translations.find(
      (t) => t.language?.code === 'mr' || t.languageId === 'mr'
    );
    const hiTrans = item.translations.find(
      (t) => t.language?.code === 'hi' || t.languageId === 'hi'
    );

    const english = enTrans?.value || '';
    const marathi = mrTrans?.value || '';
    const hindi = hiTrans?.value || '';

    // Check if alias exists in translations_management
    const existing: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM "translations_management" WHERE "alias" = $1 LIMIT 1`,
      alias
    );

    if (existing && existing.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "translations_management"
         SET "english" = $1, "marathi" = $2, "hindi" = $3, "module" = $4, "description" = $5, "updated_at" = CURRENT_TIMESTAMP
         WHERE "alias" = $6`,
        english,
        marathi,
        hindi,
        moduleName,
        description,
        alias
      );
      updatedCount++;
    } else {
      const generatedId = `tm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "translations_management" ("id", "alias", "english", "marathi", "hindi", "module", "description", "updated_at", "created_at")
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        generatedId,
        alias,
        english,
        marathi,
        hindi,
        moduleName,
        description
      );
      insertedCount++;
    }
  }

  const totalInTable: any[] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int as total FROM "translations_management"`
  );

  console.log(`🎉 Migration complete!`);
  console.log(`   - Newly inserted rows: ${insertedCount}`);
  console.log(`   - Updated rows: ${updatedCount}`);
  console.log(`   - Total rows in translations_management: ${totalInTable[0]?.total || 0}`);
}

migrate()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
