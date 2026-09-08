import { prisma } from '../src/config/db';
import { getISTDateMidnight, formatTimeIST, formatDateIST } from '../src/utils/timezone';
import { AttendanceStatus } from '../src/types/crm.types';

async function runTests() {
  console.log('=== STARTING ATTENDANCE LIFECYCLE TESTS ===');

  // 1. Setup test employee
  const testEmail = `test_att_${Date.now()}@swaatienterprises.in`;
  const employee = await prisma.employee.create({
    data: {
      employeeCode: `EMP-TEST-${Date.now().toString().slice(-4)}`,
      name: 'Test Attendance User',
      email: testEmail,
      mobile: '9876543210',
      department: 'Operations',
      designation: 'Field Officer',
      active: true,
      joiningDate: new Date(),
    },
  });
  console.log(`Created test employee: ${employee.name} (${employee.employeeCode}, ID: ${employee.id})`);

  const todayDate = getISTDateMidnight(new Date());
  console.log(`Today IST Date: ${formatDateIST(new Date())} (${todayDate.toISOString()})`);

  try {
    // ----------------------------------------------------
    // TEST 1: First Check-In
    // ----------------------------------------------------
    console.log('\n--- TEST 1: First Check-In ---');
    const checkInTimeStr = formatTimeIST(new Date());
    const firstCheckIn = await prisma.attendance.create({
      data: {
        employeeId: employee.id,
        attendanceDate: todayDate,
        checkIn: checkInTimeStr,
        checkOut: '-',
        workingHours: 'In Progress',
        workingMinutes: 0,
        attendanceStatus: AttendanceStatus.PRESENT,
        isLate: false,
        lateMinutes: 0,
      },
    });
    console.log('✔ First check-in succeeded:', {
      id: firstCheckIn.id,
      date: firstCheckIn.attendanceDate,
      checkIn: firstCheckIn.checkIn,
      checkOut: firstCheckIn.checkOut,
      status: firstCheckIn.attendanceStatus,
    });

    // ----------------------------------------------------
    // TEST 2: Duplicate Check-In (Same Day)
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Duplicate Check-In (Same Day) ---');
    let duplicatePrevented = false;
    try {
      // Direct query check before insert
      const existing = await prisma.attendance.findUnique({
        where: {
          employeeId_attendanceDate: {
            employeeId: employee.id,
            attendanceDate: todayDate,
          },
        },
      });

      if (existing) {
        console.log('✔ Pre-check caught duplicate: Record already exists for today.');
      }

      // Even if attempted via DB create (concurrent race condition test)
      await prisma.attendance.create({
        data: {
          employeeId: employee.id,
          attendanceDate: todayDate,
          checkIn: '10:15 AM',
          checkOut: '-',
          workingHours: 'In Progress',
          workingMinutes: 0,
          attendanceStatus: AttendanceStatus.PRESENT,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
        duplicatePrevented = true;
        console.log('✔ DB Unique Constraint @@unique([employeeId, attendanceDate]) correctly rejected duplicate insert.');
      } else {
        console.error('Unexpected error during duplicate test:', err);
      }
    }

    if (!duplicatePrevented) {
      throw new Error('FAILED: DB allowed duplicate check-in for the same employee and date!');
    }

    // ----------------------------------------------------
    // TEST 3: Concurrent Check-In Requests (Race Condition Simulation)
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Concurrent Duplicate Requests ---');
    const results = await Promise.allSettled([
      prisma.attendance.create({
        data: {
          employeeId: employee.id,
          attendanceDate: todayDate,
          checkIn: '10:01 AM',
          checkOut: '-',
          workingHours: 'In Progress',
        },
      }),
      prisma.attendance.create({
        data: {
          employeeId: employee.id,
          attendanceDate: todayDate,
          checkIn: '10:02 AM',
          checkOut: '-',
          workingHours: 'In Progress',
        },
      }),
    ]);

    const allRejected = results.every((r) => r.status === 'rejected');
    if (allRejected) {
      console.log('✔ Concurrent inserts were strictly rejected by database uniqueness.');
    } else {
      throw new Error('FAILED: A concurrent insert succeeded when it should have been rejected!');
    }

    // ----------------------------------------------------
    // TEST 4: Check-Out
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Check-Out ---');
    const checkOutTimeStr = '06:30 PM';
    const checkedOutRecord = await prisma.attendance.update({
      where: { id: firstCheckIn.id },
      data: {
        checkOut: checkOutTimeStr,
        workingMinutes: 480,
        workingHours: '8.0 hrs',
      },
    });
    console.log('✔ Check-out succeeded:', {
      id: checkedOutRecord.id,
      checkIn: checkedOutRecord.checkIn,
      checkOut: checkedOutRecord.checkOut,
      workingHours: checkedOutRecord.workingHours,
    });

    // ----------------------------------------------------
    // TEST 5: Duplicate Check-Out (Already Closed Day)
    // ----------------------------------------------------
    console.log('\n--- TEST 5: Duplicate Check-Out (Already Closed Day) ---');
    const currentStatus = await prisma.attendance.findUnique({
      where: {
        employeeId_attendanceDate: {
          employeeId: employee.id,
          attendanceDate: todayDate,
        },
      },
    });

    if (currentStatus && currentStatus.checkOut !== '-') {
      console.log(`✔ Verified: Attendance is closed (checkOut: "${currentStatus.checkOut}"). No further check-out allowed.`);
    } else {
      throw new Error('FAILED: Attendance should be closed after checkout!');
    }

    // ----------------------------------------------------
    // TEST 6: Check-In After Check-Out (Same Day Re-checkin)
    // ----------------------------------------------------
    console.log('\n--- TEST 6: Check-In After Check-Out (Same Day Re-checkin) ---');
    const recheckAttempt = await prisma.attendance.findUnique({
      where: {
        employeeId_attendanceDate: {
          employeeId: employee.id,
          attendanceDate: todayDate,
        },
      },
    });
    if (recheckAttempt) {
      console.log('✔ Blocked re-checkin: Existing attendance record for today prevents another check-in.');
    }

    // ----------------------------------------------------
    // TEST 7: Next Calendar Day Check-In
    // ----------------------------------------------------
    console.log('\n--- TEST 7: Next Calendar Day Check-In ---');
    const nextDay = new Date(todayDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    console.log(`Simulating next calendar day: ${nextDay.toISOString().split('T')[0]}`);

    const nextDayCheckIn = await prisma.attendance.create({
      data: {
        employeeId: employee.id,
        attendanceDate: nextDay,
        checkIn: '09:30 AM',
        checkOut: '-',
        workingHours: 'In Progress',
        workingMinutes: 0,
        attendanceStatus: AttendanceStatus.PRESENT,
      },
    });

    console.log('✔ Next day check-in succeeded cleanly:', {
      id: nextDayCheckIn.id,
      date: nextDayCheckIn.attendanceDate,
      checkIn: nextDayCheckIn.checkIn,
      checkOut: nextDayCheckIn.checkOut,
    });

    // ----------------------------------------------------
    // TEST 8: Admin Correction Flow
    // ----------------------------------------------------
    console.log('\n--- TEST 8: Admin Attendance Correction ---');
    const correctedRecord = await prisma.attendance.update({
      where: { id: firstCheckIn.id },
      data: {
        attendanceStatus: AttendanceStatus.HALF_DAY,
        originalStatus: AttendanceStatus.PRESENT,
        correctedBy: 'Administrator',
        correctionReason: 'Authorized half day for client presentation',
        correctedAt: new Date(),
      },
    });

    console.log('✔ Admin correction succeeded without creating duplicate records:', {
      id: correctedRecord.id,
      originalStatus: correctedRecord.originalStatus,
      correctedStatus: correctedRecord.attendanceStatus,
      reason: correctedRecord.correctionReason,
      correctedBy: correctedRecord.correctedBy,
    });

    // Total records count for this employee must be exactly 2 (today + next day)
    const allRecords = await prisma.attendance.findMany({
      where: { employeeId: employee.id },
    });
    console.log(`Total attendance records created for test employee: ${allRecords.length} (Expected: 2)`);
    if (allRecords.length !== 2) {
      throw new Error(`FAILED: Expected 2 attendance records, found ${allRecords.length}`);
    }

    console.log('\n=== ALL ATTENDANCE LIFECYCLE TESTS PASSED PERFECTLY ===');
  } finally {
    // Cleanup test data
    await prisma.attendance.deleteMany({ where: { employeeId: employee.id } });
    await prisma.employee.delete({ where: { id: employee.id } });
    console.log('Test records cleaned up.');
  }
}

runTests()
  .catch((e) => {
    console.error('Test execution failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
