import { prisma } from '../config/db';

export class SequenceService {
  /**
   * Concurrency-safe Employee code generator (EMP-001, EMP-002, ...)
   * Uses atomic PostgreSQL sequence.
   */
  static async getNextEmployeeCode(): Promise<string> {
    const seqName = 'employee_code_seq';
    await prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS ${seqName} START WITH 1 INCREMENT BY 1;`
    );
    const [result] = await prisma.$queryRawUnsafe<[{ nextval: string | number | bigint }]>(
      `SELECT nextval('${seqName}') as nextval;`
    );
    const num = Number(result.nextval);
    return `EMP-${String(num).padStart(3, '0')}`;
  }

  /**
   * Concurrency-safe Lead code generator (LEAD-YYYY-001, LEAD-YYYY-002, ...)
   * Uses atomic PostgreSQL sequence keyed by calendar year.
   */
  static async getNextLeadCode(year: number = new Date().getFullYear()): Promise<string> {
    const seqName = `lead_code_${year}_seq`;
    await prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS ${seqName} START WITH 1 INCREMENT BY 1;`
    );
    const [result] = await prisma.$queryRawUnsafe<[{ nextval: string | number | bigint }]>(
      `SELECT nextval('${seqName}') as nextval;`
    );
    const num = Number(result.nextval);
    return `LEAD-${year}-${String(num).padStart(3, '0')}`;
  }

  /**
   * Concurrency-safe Task code generator (TSK-001, TSK-002, ...)
   * Uses atomic PostgreSQL sequence.
   */
  static async getNextTaskCode(): Promise<string> {
    const seqName = 'task_code_seq';
    await prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS ${seqName} START WITH 1 INCREMENT BY 1;`
    );
    const [result] = await prisma.$queryRawUnsafe<[{ nextval: string | number | bigint }]>(
      `SELECT nextval('${seqName}') as nextval;`
    );
    const num = Number(result.nextval);
    return `TSK-${String(num).padStart(3, '0')}`;
  }

  /**
   * Concurrency-safe Leave Request code generator (LV-001, LV-002, ...)
   * Uses atomic PostgreSQL sequence.
   */
  static async getNextLeaveCode(): Promise<string> {
    const seqName = 'leave_code_seq';
    await prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS ${seqName} START WITH 1 INCREMENT BY 1;`
    );
    const [result] = await prisma.$queryRawUnsafe<[{ nextval: string | number | bigint }]>(
      `SELECT nextval('${seqName}') as nextval;`
    );
    const num = Number(result.nextval);
    return `LV-${String(num).padStart(3, '0')}`;
  }

  /**
   * Concurrency-safe Product code generator (PROD-001, PROD-002, ...)
   * Uses atomic PostgreSQL sequence.
   */
  static async getNextProductCode(): Promise<string> {
    const seqName = 'product_code_seq';
    await prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS ${seqName} START WITH 1 INCREMENT BY 1;`
    );
    const [result] = await prisma.$queryRawUnsafe<[{ nextval: string | number | bigint }]>(
      `SELECT nextval('${seqName}') as nextval;`
    );
    const num = Number(result.nextval);
    return `PROD-${String(num).padStart(3, '0')}`;
  }

  /**
   * Concurrency-safe Recurring Task / SOP code generator (SOP-001, SOP-002, ...)
   * Uses atomic PostgreSQL sequence.
   */
  static async getNextRecurringTaskCode(): Promise<string> {
    const seqName = 'recurring_task_code_seq';
    await prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS ${seqName} START WITH 1 INCREMENT BY 1;`
    );
    const [result] = await prisma.$queryRawUnsafe<[{ nextval: string | number | bigint }]>(
      `SELECT nextval('${seqName}') as nextval;`
    );
    const num = Number(result.nextval);
    return `SOP-${String(num).padStart(3, '0')}`;
  }
}
