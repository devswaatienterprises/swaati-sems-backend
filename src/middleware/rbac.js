const ApiResponse = require('../utils/apiResponse');

function authorize(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return ApiResponse.error(res, 'Unauthenticated', 401);
    }

    const userRole = req.user.role;
    if (allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      return ApiResponse.error(
        res,
        `Access denied. Requires one of roles: [${allowedRoles.join(', ')}]`,
        403
      );
    }

    next();
  };
}

module.exports = authorize;
