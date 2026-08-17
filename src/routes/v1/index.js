const express = require('express');
const router = express.Router();
const ApiResponse = require('../../utils/apiResponse');

const authRoutes = require('./auth.routes');
const employeeRoutes = require('./employees.routes');
const leadRoutes = require('./leads.routes');

// Health Check
router.get('/health', (req, res) => {
  return ApiResponse.success(
    res,
    { status: 'healthy', timestamp: new Date().toISOString() },
    'Swaati Enterprises API v1 Server Operational'
  );
});

router.use('/auth', authRoutes);
router.use('/employees', employeeRoutes);
router.use('/leads', leadRoutes);

module.exports = router;
