import { Router } from 'express';
import { ApiResponse } from '../../utils/apiResponse';
import { AuthController } from '../../controllers/auth.controller';
import { EmployeeController } from '../../controllers/employee.controller';
import { AttendanceController } from '../../controllers/attendance.controller';
import { LeaveController } from '../../controllers/leave.controller';
import { TaskController } from '../../controllers/task.controller';
import { RecurringTaskController } from '../../controllers/recurringTask.controller';
import { LeadController } from '../../controllers/lead.controller';
import { ProductController } from '../../controllers/product.controller';
import { PublicController } from '../../controllers/public.controller';
import { MessageController } from '../../controllers/message.controller';
import { NotificationController } from '../../controllers/notification.controller';
import { ReportController } from '../../controllers/report.controller';
import { SettingController } from '../../controllers/setting.controller';
import { AuditController } from '../../controllers/audit.controller';
import { ContentController } from '../../controllers/content.controller';
import { authenticate } from '../../middleware/auth';
import { authorize, requirePermission, RoleType } from '../../middleware/rbac';
import { uploadMiddleware } from '../../middleware/upload';
import { authLimiter, publicLeadLimiter, uploadLimiter } from '../../middleware/rateLimit';

const router = Router();

// Health Check
router.get('/health', (req, res) => {
  return ApiResponse.success(
    res,
    { status: 'healthy', timestamp: new Date().toISOString(), timezone: 'Asia/Kolkata' },
    'Swaati Enterprises Operating Backend API v1'
  );
});

// ==========================================
// 1. PUBLIC ENDPOINTS (Public Website Integration)
// ==========================================
router.get('/public/products', PublicController.getProducts);
router.get('/public/products/:id/datasheet', PublicController.getProductDatasheet);
router.post('/public/leads', publicLeadLimiter, PublicController.submitWebsiteLead);

// ==========================================
// 2. AUTHENTICATION & PROFILE
// ==========================================
router.post('/auth/login', authLimiter, AuthController.login);
router.post('/auth/logout', AuthController.logout);
router.get('/auth/me', authenticate, AuthController.me);

// ==========================================
// 3. EMPLOYEE DIRECTORY & IDENTITY DOCUMENTS (Admin Only)
// ==========================================
router.get('/employees', authenticate, authorize([RoleType.ADMIN]), EmployeeController.getAll);
router.get('/employees/:id', authenticate, EmployeeController.getById);
router.post('/employees', authenticate, authorize([RoleType.ADMIN]), EmployeeController.create);
router.put('/employees/:id', authenticate, authorize([RoleType.ADMIN]), EmployeeController.update);
router.patch('/employees/:id/status', authenticate, authorize([RoleType.ADMIN]), EmployeeController.updateStatus);
router.patch('/employees/:id/permissions', authenticate, authorize([RoleType.ADMIN]), EmployeeController.updatePermissions);
router.post(
  '/employees/:id/documents',
  authenticate,
  authorize([RoleType.ADMIN]),
  uploadLimiter,
  uploadMiddleware.fields([
    { name: 'frontImage', maxCount: 1 },
    { name: 'backImage', maxCount: 1 },
  ]),
  EmployeeController.addDocument
);
router.get(
  '/employees/:id/documents/:docId/signed-url',
  authenticate,
  authorize([RoleType.ADMIN]),
  EmployeeController.getKycSignedUrls
);
router.delete(
  '/employees/:id/documents/:docId',
  authenticate,
  authorize([RoleType.ADMIN]),
  EmployeeController.deleteDocument
);

// ==========================================
// 4. ATTENDANCE & SHIFTS
// ==========================================
router.get('/attendance', authenticate, requirePermission('attendance.view_own', 'attendance'), AttendanceController.getAll);
router.post('/attendance/check-in', authenticate, requirePermission('attendance.checkin', 'attendance'), AttendanceController.checkIn);
router.post('/attendance/check-out', authenticate, requirePermission('attendance.checkin', 'attendance'), AttendanceController.checkOut);
router.patch('/attendance/:id/correct', authenticate, requirePermission('attendance.approve', 'attendance'), AttendanceController.correct);

// ==========================================
// 5. LEAVE MANAGEMENT
// ==========================================
router.get('/leaves', authenticate, requirePermission('leave.view_own', 'leave'), LeaveController.getAll);
router.post('/leaves', authenticate, requirePermission('leave.apply', 'leave'), LeaveController.create);
router.patch('/leaves/:id/status', authenticate, requirePermission('leave.approve', 'leave'), LeaveController.updateStatus);
router.post('/leaves/:id/cancel', authenticate, requirePermission('leave.cancel', 'leave'), LeaveController.cancel);

// ==========================================
// 6. TASKS & WORKFLOWS
// ==========================================
router.get('/tasks', authenticate, requirePermission('tasks.view_own', 'tasks'), TaskController.getAll);
router.post('/tasks', authenticate, requirePermission('tasks.create', 'tasks'), TaskController.create);
router.patch('/tasks/:id/status', authenticate, requirePermission('tasks.status', 'tasks'), TaskController.updateStatus);
router.patch('/tasks/:id/reassign', authenticate, requirePermission('tasks.assign', 'tasks'), TaskController.reassign);
router.post('/tasks/:id/comments', authenticate, requirePermission('tasks.comments', 'tasks'), TaskController.addComment);

// Recurring Tasks / Daily SOPs
router.get('/tasks/recurring', authenticate, requirePermission('tasks.view_own', 'tasks'), RecurringTaskController.getAll);
router.get('/tasks/recurring/:id', authenticate, requirePermission('tasks.view_own', 'tasks'), RecurringTaskController.getById);
router.post('/tasks/recurring', authenticate, requirePermission('tasks.create', 'tasks'), RecurringTaskController.create);
router.put('/tasks/recurring/:id', authenticate, requirePermission('tasks.edit', 'tasks'), RecurringTaskController.update);
router.patch('/tasks/recurring/:id/status', authenticate, requirePermission('tasks.edit', 'tasks'), RecurringTaskController.updateStatus);
router.delete('/tasks/recurring/:id', authenticate, requirePermission('tasks.delete', 'tasks'), RecurringTaskController.delete);
router.post('/tasks/recurring/generate', authenticate, requirePermission('tasks.create', 'tasks'), RecurringTaskController.generate);

// ==========================================
// 7. LEADS & ENQUIRIES
// ==========================================
router.get('/leads', authenticate, requirePermission('leads.view', 'leads'), LeadController.getAll);
router.post('/leads', authenticate, requirePermission('leads.create', 'leads'), LeadController.create);
router.patch('/leads/:id', authenticate, requirePermission('leads.edit', 'leads'), LeadController.update);
router.patch('/leads/:id/status', authenticate, requirePermission('leads.status', 'leads'), LeadController.updateStatus);

// ==========================================
// 8. PRODUCT DATASHEET LIBRARY
// ==========================================
router.get('/products', authenticate, requirePermission('products.view', 'products'), ProductController.getAll);
router.post('/products', authenticate, requirePermission('products.create', 'products'), ProductController.create);
router.post(
  '/products/:id/documents',
  authenticate,
  requirePermission('products.edit', 'products'),
  uploadLimiter,
  uploadMiddleware.single('file'),
  ProductController.uploadDocument
);
router.put(
  '/products/:id/documents/:docId',
  authenticate,
  requirePermission('products.edit', 'products'),
  uploadLimiter,
  uploadMiddleware.single('file'),
  ProductController.replaceDocument
);
router.get(
  '/products/:id/documents/:docId/signed-url',
  authenticate,
  requirePermission('products.view', 'products'),
  ProductController.getDocumentSignedUrl
);
router.delete('/products/:id/documents/:docId', authenticate, requirePermission('products.delete', 'products'), ProductController.deleteDocument);

// ==========================================
// 9. INTERNAL MESSAGING
// ==========================================
router.get('/messages/conversations', authenticate, requirePermission('messaging.view', 'messaging'), MessageController.getConversations);
router.get('/messages/conversations/:conversationId', authenticate, requirePermission('messaging.view', 'messaging'), MessageController.getConversationMessages);
router.post('/messages/groups', authenticate, requirePermission('messaging.create_group', 'messaging'), MessageController.createGroup);
router.get('/messages/:recipientId', authenticate, requirePermission('messaging.view', 'messaging'), MessageController.getMessages);
router.post(
  '/messages',
  authenticate,
  requirePermission('messaging.send', 'messaging'),
  uploadLimiter,
  uploadMiddleware.single('attachment'),
  MessageController.sendMessage
);
router.get(
  '/messages/attachments/:messageId/signed-url',
  authenticate,
  requirePermission('messaging.attachments', 'messaging'),
  MessageController.getAttachmentSignedUrl
);

// ==========================================
// 10. NOTIFICATIONS
// ==========================================
router.get('/notifications', authenticate, requirePermission('notifications.view', 'notifications'), NotificationController.getAll);
router.patch('/notifications/mark-all-read', authenticate, requirePermission('notifications.read', 'notifications'), NotificationController.markAllRead);
router.patch('/notifications/:id/read', authenticate, requirePermission('notifications.read', 'notifications'), NotificationController.markRead);

// ==========================================
// 11. REPORTS & MONTHLY PAYROLL
// ==========================================
router.get('/reports/summary', authenticate, requirePermission('reports.view', 'reports'), ReportController.getSummary);
router.get('/reports/payroll', authenticate, requirePermission('payroll.view', 'reports'), ReportController.getMonthlyPayroll);

// ==========================================
// 12. CONFIGURABLE SYSTEM SETTINGS
// ==========================================
router.get('/settings', SettingController.getAll);
router.patch('/settings', authenticate, authorize([RoleType.ADMIN]), SettingController.update);

// ==========================================
// 13. AUDIT / ACTIVITY TRAIL
// ==========================================
router.get('/audit', authenticate, authorize([RoleType.ADMIN]), AuditController.getAll);
router.get('/employees/:id/activity', authenticate, authorize([RoleType.ADMIN]), AuditController.getEmployeeActivity);

// ==========================================
// 14. CONTENT & RUNTIME TRANSLATION LAYER
// ==========================================
router.get('/content/bundle', ContentController.getBundle);
router.get('/content/languages', ContentController.getLanguages);

export default router;
