import { verifyIP, verifyGPS, buildVerificationPayload } from '../src/utils/verificationHelper';
import { prisma } from '../src/config/db';

async function runTests() {
  console.log('==================================================');
  console.log('🧪 TESTING ATTENDANCE VERIFICATION LOGIC & DATABASE');
  console.log('==================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string, detail?: any) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`, detail || '');
      failed++;
    }
  }

  // --- UNIT TESTS: verifyIP ---
  console.log('\n--- 1. Testing verifyIP ---');
  {
    const res1 = verifyIP('203.0.113.195', '203.0.113.195, 198.51.100.1');
    assert(res1.result === 'VERIFIED', 'IP matching one of approved IPs is VERIFIED');

    const res2 = verifyIP('1.2.3.4', '203.0.113.195, 198.51.100.1');
    assert(res2.result === 'IP_MISMATCH', 'IP not in approved list returns IP_MISMATCH');

    const res3 = verifyIP(null, '203.0.113.195');
    assert(res3.result === 'IP_UNAVAILABLE', 'Null IP returns IP_UNAVAILABLE');

    const res4 = verifyIP('203.0.113.195', '');
    assert(res4.result === 'IP_UNAVAILABLE', 'Empty approved IPs returns IP_UNAVAILABLE');
  }

  // --- UNIT TESTS: verifyGPS ---
  console.log('\n--- 2. Testing verifyGPS (Haversine Distance) ---');
  {
    // Pune office approx: 18.5204, 73.8567
    const officeLat = 18.5204;
    const officeLng = 73.8567;
    const radius = 200; // 200m

    // Point ~50m away
    const closeLat = 18.5206;
    const closeLng = 73.8569;
    const res1 = verifyGPS(closeLat, closeLng, 10, officeLat, officeLng, radius);
    assert(res1.result === 'VERIFIED' && (res1.distanceMeters ?? 999) <= radius, 'Within 200m radius is VERIFIED');

    // Point ~5km away (Mumbai direction)
    const farLat = 18.5600;
    const farLng = 73.8500;
    const res2 = verifyGPS(farLat, farLng, 15, officeLat, officeLng, radius);
    assert(res2.result === 'LOCATION_MISMATCH' && (res2.distanceMeters ?? 0) > 1000, '5km away returns LOCATION_MISMATCH');

    // Unavailable / null GPS
    const res3 = verifyGPS(null, null, null, officeLat, officeLng, radius);
    assert(res3.result === 'LOCATION_UNAVAILABLE', 'Null GPS coords returns LOCATION_UNAVAILABLE');
  }

  // --- INTEGRATION TESTS: buildVerificationPayload ---
  console.log('\n--- 3. Testing buildVerificationPayload (all modes) ---');
  {
    const mockReq = {
      headers: { 'x-forwarded-for': '203.0.113.10' },
      socket: {},
    } as any;

    // OFFICE_IP mode
    const payloadIP = buildVerificationPayload('OFFICE_IP', mockReq, { unavailable: true }, {
      approvedIPs: '203.0.113.10, 203.0.113.11',
    });
    assert(payloadIP.overallResult === 'VERIFIED', 'OFFICE_IP matches correctly');

    // MOBILE_GPS mode (verified)
    const payloadGPS = buildVerificationPayload('MOBILE_GPS', mockReq, {
      lat: 18.5205,
      lng: 73.8568,
      accuracy: 8,
    }, {
      approvedLat: 18.5204,
      approvedLng: 73.8567,
      approvedRadiusMeters: 200,
    });
    assert(payloadGPS.overallResult === 'VERIFIED', 'MOBILE_GPS within radius is VERIFIED');

    // MOBILE_GPS mode (denied)
    const payloadGPSDenied = buildVerificationPayload('MOBILE_GPS', mockReq, {
      unavailable: true,
    }, {
      approvedLat: 18.5204,
      approvedLng: 73.8567,
      approvedRadiusMeters: 200,
    });
    assert(payloadGPSDenied.overallResult === 'LOCATION_UNAVAILABLE', 'MOBILE_GPS with permission denied is LOCATION_UNAVAILABLE');

    // HYBRID mode (GPS verified)
    const payloadHybrid = buildVerificationPayload('HYBRID', mockReq, {
      lat: 18.5205,
      lng: 73.8568,
      accuracy: 8,
    }, {
      approvedIPs: '198.51.100.1', // different IP, but GPS is primary
      approvedLat: 18.5204,
      approvedLng: 73.8567,
      approvedRadiusMeters: 200,
    });
    assert(payloadHybrid.overallResult === 'VERIFIED', 'HYBRID mode with valid GPS is VERIFIED (GPS primary)');
  }

  // --- DATABASE TEST: Create and update attendance with verification payloads ---
  console.log('\n--- 4. Testing Database Persistence & JSON storage ---');
  {
    const testEmployee = await prisma.employee.findFirst({
      where: { active: true },
    });

    if (testEmployee) {
      // Test updating employee verification config
      const updatedEmp = await prisma.employee.update({
        where: { id: testEmployee.id },
        data: {
          attendanceVerification: 'HYBRID',
          approvedIPs: '203.0.113.100',
          approvedLat: 18.5204,
          approvedLng: 73.8567,
          approvedRadiusMeters: 250,
        },
      });
      assert(updatedEmp.attendanceVerification === 'HYBRID', 'Employee verification config saved in PostgreSQL');
      assert(updatedEmp.approvedRadiusMeters === 250, 'Employee approved radius saved');

      // Verify Attendance model can store and retrieve checkInVerification / checkOutVerification
      const sampleCheckInPayload = {
        method: 'HYBRID',
        ip: '203.0.113.100',
        ipResult: 'VERIFIED',
        lat: 18.5205,
        lng: 73.8568,
        accuracy: 10,
        gpsResult: 'VERIFIED',
        overallResult: 'VERIFIED',
        reason: 'Within 250m radius (actual: 15m)',
        capturedAt: new Date().toISOString(),
        distanceMeters: 15,
      };

      const sampleCheckOutPayload = {
        method: 'HYBRID',
        ip: '203.0.113.100',
        ipResult: 'VERIFIED',
        lat: 18.5205,
        lng: 73.8568,
        accuracy: 10,
        gpsResult: 'VERIFIED',
        overallResult: 'VERIFIED',
        reason: 'Within 250m radius (actual: 15m)',
        capturedAt: new Date().toISOString(),
        distanceMeters: 15,
      };

      // Find an attendance record or create a temporary one for 1999-01-01
      const testDate = new Date('1999-01-01T00:00:00.000Z');
      const testAtt = await prisma.attendance.upsert({
        where: {
          employeeId_attendanceDate: {
            employeeId: testEmployee.id,
            attendanceDate: testDate,
          },
        },
        create: {
          employeeId: testEmployee.id,
          attendanceDate: testDate,
          checkIn: '10:00 AM',
          checkOut: '06:30 PM',
          workingHours: '8.5 hrs',
          workingMinutes: 510,
          attendanceStatus: 'PRESENT',
          checkInVerification: JSON.stringify(sampleCheckInPayload),
          checkOutVerification: JSON.stringify(sampleCheckOutPayload),
        },
        update: {
          checkInVerification: JSON.stringify(sampleCheckInPayload),
          checkOutVerification: JSON.stringify(sampleCheckOutPayload),
        },
      });

      const parsedIn = JSON.parse(testAtt.checkInVerification || '{}');
      const parsedOut = JSON.parse(testAtt.checkOutVerification || '{}');
      assert(parsedIn.overallResult === 'VERIFIED', 'Database successfully persisted checkInVerification JSON');
      assert(parsedOut.overallResult === 'VERIFIED', 'Database successfully persisted checkOutVerification JSON');
      assert(parsedIn.distanceMeters === 15, 'Distance meters preserved');

      // Cleanup test attendance record
      await prisma.attendance.delete({
        where: { id: testAtt.id },
      });
      console.log('🧹 Cleaned up test attendance record');
    } else {
      console.log('⚠️ No test employee found for DB verification test');
    }
  }

  console.log('\n==================================================');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('==================================================');

  if (failed > 0) process.exit(1);
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
