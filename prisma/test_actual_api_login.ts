import http from 'http';

async function testActualApiLogin() {
  console.log('🌐 Testing actual HTTP API endpoint: http://localhost:4000/api/v1/auth/login');

  const postData = JSON.stringify({
    email: 'admin@swaatienterprises.in',
    password: 'Admin@123',
  });

  const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      console.log(`📡 Response HTTP Status: ${res.statusCode}`);
      try {
        const json = JSON.parse(body);
        console.log('📡 Response Body Summary:', {
          success: json.success,
          message: json.message,
          userEmail: json.data?.user?.email,
          userRole: json.data?.user?.role,
          hasToken: Boolean(json.data?.token),
          permissionsCount: Object.keys(json.data?.user?.permissions || {}).length,
        });

        if (res.statusCode === 200 && json.success && json.data?.token && json.data?.user?.email === 'admin@swaatienterprises.in') {
          console.log('\n✅ ACTUAL LOGIN API TEST PASSED 100%!');
        } else {
          console.error('\n❌ ACTUAL LOGIN API TEST FAILED!');
          process.exit(1);
        }
      } catch (err: any) {
        console.error('❌ Failed to parse response:', err.message, body);
        process.exit(1);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`❌ HTTP request error: ${e.message}`);
    process.exit(1);
  });

  req.write(postData);
  req.end();
}

testActualApiLogin();
