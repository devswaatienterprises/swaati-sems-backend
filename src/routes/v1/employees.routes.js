const express = require('express');
const router = express.Router();
const ApiResponse = require('../../utils/apiResponse');

// GET /api/v1/employees
router.get('/', (req, res) => {
  return ApiResponse.success(res, [], 'Employees endpoint initialized');
});

module.exports = router;
