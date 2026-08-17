const express = require('express');
const router = express.Router();
const ApiResponse = require('../../utils/apiResponse');

// GET /api/v1/leads
router.get('/', (req, res) => {
  return ApiResponse.success(res, [], 'Leads endpoint initialized');
});

module.exports = router;
