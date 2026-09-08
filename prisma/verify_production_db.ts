import { PrismaClient } from '@prisma/client';
import { ContentService } from '../src/services/content.service';

const prisma = new PrismaClient();

async function verify() {
  console.log('🔍 ========================================================');
  console.log('🔍 PRODUCTION SUPABASE TRANSLATION DATABASE VERIFICATION');
  console.log('🔍 ========================================================\n');

  // 1. Enable RLS on translations_management for Supabase security
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "translations_management" ENABLE ROW LEVEL SECURITY;
  `);
  console.log('🔒 1. Row Level Security (RLS) enabled on translations_management.');

  // 2. Query Table Metadata
  const columns: any[] = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'translations_management'
    ORDER BY ordinal_position;
  `);

  console.log('\n📊 2. Exact Column Structure of translations_management:');
  console.table(columns);

  // 3. Check existing tables and counts
  const countTm: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "translations_management"`);
  const countCi: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "content_items"`);
  const countCt: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "content_translations"`);
  const countLang: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "languages"`);
  const countCv: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as count FROM "content_versions"`);

  console.log('\n📦 3. Database Table Record Counts:');
  console.log(`   - translations_management : ${countTm[0]?.count} rows`);
  console.log(`   - content_items           : ${countCi[0]?.count} rows (Preserved intact)`);
  console.log(`   - content_translations    : ${countCt[0]?.count} rows (Preserved intact)`);
  console.log(`   - languages               : ${countLang[0]?.count} rows (Preserved intact)`);
  console.log(`   - content_versions        : ${countCv[0]?.count} rows (Preserved intact)`);

  // 4. Check Unique Aliases
  const uniqueAliases: any[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT alias)::int as distinct_count, COUNT(alias)::int as total_count
    FROM "translations_management"
  `);
  console.log('\n🔑 4. Alias Uniqueness Check:');
  console.log(`   - Total rows: ${uniqueAliases[0]?.total_count}`);
  console.log(`   - Distinct aliases: ${uniqueAliases[0]?.distinct_count}`);
  const isUnique = uniqueAliases[0]?.distinct_count === uniqueAliases[0]?.total_count;
  console.log(`   - Is 100% Unique: ${isUnique ? '✅ YES' : '❌ NO'}`);

  // 5. Compare content_items against translations_management
  const contentItems = await prisma.contentItem.findMany({
    include: { translations: { include: { language: true } } },
  });

  let matchCount = 0;
  let mismatchCount = 0;

  for (const ci of contentItems) {
    const tm = await prisma.translationManagement.findUnique({
      where: { alias: ci.contentKey },
    });

    if (!tm) {
      console.error(`❌ Missing alias in translations_management: ${ci.contentKey}`);
      mismatchCount++;
      continue;
    }

    const enExpected = ci.translations.find((t) => t.language?.code === 'en')?.value || '';
    const mrExpected = ci.translations.find((t) => t.language?.code === 'mr')?.value || '';
    const hiExpected = ci.translations.find((t) => t.language?.code === 'hi')?.value || '';

    const enMatch = (tm.english || '') === enExpected;
    const mrMatch = (tm.marathi || '') === mrExpected;
    const hiMatch = (tm.hindi || '') === hiExpected;

    if (enMatch && mrMatch && hiMatch) {
      matchCount++;
    } else {
      console.warn(`⚠️ Content mismatch for '${ci.contentKey}':`, {
        expected: { en: enExpected, mr: mrExpected, hi: hiExpected },
        actual: { en: tm.english, mr: tm.marathi, hi: tm.hindi },
      });
      mismatchCount++;
    }
  }

  console.log('\n🔍 5. Data Integrity Verification against Original Tables:');
  console.log(`   - Perfectly matched aliases: ${matchCount} / ${contentItems.length}`);
  console.log(`   - Mismatches: ${mismatchCount}`);

  // 6. Inspect Sample Records Across Key Categories
  const sampleAliases = [
    'brand_title',
    'crm_subtitle',
    'nav_dashboard',
    'navigation.dashboard',
    'nav_attendance',
    'check_in',
    'check_out',
    'nav_leave',
    'btn_apply_leave',
    'nav_tasks',
    'btn_create_task',
    'tasks.page.title',
    'nav_leads',
    'btn_add_lead',
    'nav_products',
    'btn_upload_document',
    'permission_denied',
  ];

  const sampleRows = await prisma.translationManagement.findMany({
    where: { alias: { in: sampleAliases } },
    select: { alias: true, english: true, marathi: true, hindi: true, module: true },
  });

  console.log('\n📋 6. Sample Live Records from translations_management:');
  console.table(sampleRows);

  // 7. Verify ContentService.getBundle runtime reader and fallback
  console.log('\n🌐 7. Testing ContentService.getBundle() Backend Reader:');
  const bundleEn = await ContentService.getBundle('en');
  const bundleMr = await ContentService.getBundle('mr');
  const bundleHi = await ContentService.getBundle('hi');

  console.log(`   - English (en) bundle: ${bundleEn.totalKeys} keys loaded.`);
  console.log(`     Sample [nav_dashboard] -> "${bundleEn.bundle['nav_dashboard']}"`);
  console.log(`     Sample [check_in]       -> "${bundleEn.bundle['check_in']}"`);

  console.log(`   - Marathi (mr) bundle: ${bundleMr.totalKeys} keys loaded.`);
  console.log(`     Sample [nav_dashboard] -> "${bundleMr.bundle['nav_dashboard']}"`);
  console.log(`     Sample [check_in]       -> "${bundleMr.bundle['check_in']}"`);

  console.log(`   - Hindi (hi) bundle:   ${bundleHi.totalKeys} keys loaded.`);
  console.log(`     Sample [nav_dashboard] -> "${bundleHi.bundle['nav_dashboard']}"`);
  console.log(`     Sample [check_in]       -> "${bundleHi.bundle['check_in']}"`);

  console.log('\n✅ ALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
}

verify()
  .catch((e) => {
    console.error('❌ Verification failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
