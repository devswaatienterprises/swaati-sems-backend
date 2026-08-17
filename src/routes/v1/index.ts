import { Router } from 'express';
import { ApiResponse } from '../../utils/apiResponse';
import { AuthController } from '../../controllers/auth.controller';
import { EmployeeController } from '../../controllers/employee.controller';
import { AttendanceController } from '../../controllers/attendance.controller';
import { TaskController } from '../../controllers/task.controller';
import { LeadController } from '../../controllers/lead.controller';
import { CustomerController } from '../../controllers/customer.controller';
import { FollowUpController } from '../../controllers/followUp.controller';
import { ProductController } from '../../controllers/product.controller';
import { NotificationController } from '../../controllers/notification.controller';
import { ReportController } from '../../controllers/report.controller';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { RoleType } from '@prisma/client';

const router = Router();

// Health Check
router.get('/health', (req, res) => {
  return ApiResponse.success(
    res,
    { status: 'healthy', timestamp: new Date().toISOString(), db: 'PostgreSQL/Prisma' },
    'Swaati Enterprises Production API v1 Operational'
  );
});

// Auth Routes
router.post('/auth/login', AuthController.login);
router.post('/auth/logout', AuthController.logout);
router.get('/auth/me', authenticate, AuthController.me);

// Employee Routes (Admin & Manager)
router.get('/employees', authenticate, authorize([RoleType.ADMIN, RoleType.MANAGER]), EmployeeController.getAll);
router.get('/employees/:id', authenticate, EmployeeController.getById);
router.post('/employees', authenticate, authorize([RoleType.ADMIN]), EmployeeController.create);
router.patch('/employees/:id/status', authenticate, authorize([RoleType.ADMIN]), EmployeeController.updateStatus);

// Attendance Routes
router.get('/attendance', authenticate, AttendanceController.getAll);
router.post('/attendance/check-in', authenticate, AttendanceController.checkIn);
router.post('/attendance/check-out', authenticate, AttendanceController.checkOut);

// Task Routes
router.get('/tasks', authenticate, TaskController.getAll);
router.post('/tasks', authenticate, authorize([RoleType.ADMIN, RoleType.MANAGER]), TaskController.create);
router.patch('/tasks/:id/status', authenticate, TaskController.updateStatus);

// Lead Routes
router.get('/leads', authenticate, LeadController.getAll);
router.post('/leads', authenticate, authorize([RoleType.ADMIN, RoleType.MANAGER]), LeadController.create);
router.patch('/leads/:id/status', authenticate, LeadController.updateStatus);

// Customer Routes
router.get('/customers', authenticate, CustomerController.getAll);
router.post('/customers', authenticate, authorize([RoleType.ADMIN, RoleType.MANAGER]), CustomerController.create);

// FollowUp Routes
router.get('/follow-ups', authenticate, FollowUpController.getAll);
router.patch('/follow-ups/:id/status', authenticate, FollowUpController.updateStatus);

// Product Routes
router.get('/products', authenticate, ProductController.getAll);

// Notification Routes
router.get('/notifications', authenticate, NotificationController.getAll);
router.patch('/notifications/:id/read', authenticate, NotificationController.markRead);

// Report Routes
router.get('/reports/summary', authenticate, ReportController.getSummary);

export default router;
