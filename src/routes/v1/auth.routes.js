const express = require('express');
const router = express.Router();
const ApiResponse = require('../../utils/apiResponse');

// POST /api/v1/auth/login
router.post('/login', (req, res) => {
  return ApiResponse.success(res, { status: 'auth_route_initialized' }, 'Auth endpoint initialized');
});

// GET /api/v1/auth/me
router.get('/me', (req, res) => {
  return ApiResponse.success(res, { status: 'user_profile_initialized' }, 'User profile endpoint initialized');
});

module.exports = router;
