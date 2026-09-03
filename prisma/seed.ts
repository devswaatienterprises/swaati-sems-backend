import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const RoleType = { ADMIN: 'ADMIN', EMPLOYEE: 'EMPLOYEE' };
const Priority = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', URGENT: 'URGENT' };
const TaskStatus = { TODO: 'TODO', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', OVERDUE: 'OVERDUE', CANCELLED: 'CANCELLED' };
const LeadStatus = { NEW: 'NEW', CONTACTED: 'CONTACTED', FOLLOW_UP: 'FOLLOW_UP', QUALIFIED: 'QUALIFIED', QUOTATION_SENT: 'QUOTATION_SENT', NEGOTIATION: 'NEGOTIATION', WON: 'WON', LOST: 'LOST' };
const AttendanceStatus = { PRESENT: 'PRESENT', LATE: 'LATE', HALF_DAY: 'HALF_DAY', ABSENT: 'ABSENT', ON_LEAVE: 'ON_LEAVE', HOLIDAY: 'HOLIDAY', WEEKLY_OFF: 'WEEKLY_OFF' };
const LeaveStatus = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', CANCELLED: 'CANCELLED' };

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Swaati Enterprises Operational CRM Database...');

  // 1. Password Hashes
  const adminPasswordHash = await bcrypt.hash('Admin@123', 10);
  const employeePasswordHash = await bcrypt.hash('Employee@123', 10);

  // Clean old records
  await prisma.contentVersion.deleteMany({});
  await prisma.contentTranslation.deleteMany({});
  await prisma.contentItem.deleteMany({});
  await prisma.language.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.message.deleteMany({});
  await prisma.conversationMember.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.taskComment.deleteMany({});
  await prisma.taskAssignmentHistory.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.leaveRequest.deleteMany({});
  await prisma.attendance.deleteMany({});
  await prisma.employeeDocument.deleteMany({});
  await prisma.userPermission.deleteMany({});
  await prisma.employee.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.productDocument.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.systemSetting.deleteMany({});

  // 2. Seed System Settings
  console.log('⚙️ Seeding System Settings...');
  await prisma.systemSetting.createMany({
    data: [
      { key: 'officeStartTime', value: '10:00 AM' },
      { key: 'officeEndTime', value: '06:30 PM' },
      { key: 'gracePeriodMinutes', value: '15' },
      { key: 'workingDays', value: '26' },
      { key: 'weeklyOffs', value: '4' },
      { key: 'companyName', value: 'Swaati Enterprises' },
      { key: 'companyEmail', value: 'info@swaatienterprises.in' },
      { key: 'companyPhone', value: '+91 93700 11133' },
    ],
  });

  // 3. Seed Users & Employees
  console.log('👥 Seeding Users & Employees...');

  // Admin Account (Shailendra Patil)
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@swaatienterprises.in',
      userId: 'admin',
      passwordHash: adminPasswordHash,
      role: RoleType.ADMIN,
      isActive: true,
      employee: {
        create: {
          employeeCode: 'EMP-101',
          userId: 'admin',
          name: 'Shailendra Patil',
          email: 'admin@swaatienterprises.in',
          mobile: '+91 93700 11133',
          department: 'Executive Management',
          designation: 'Founder & Managing Director',
          joiningDate: new Date('2006-04-15'),
          employmentStatus: 'Active',
          active: true,
          avatar: 'SP',
          reportingManager: 'Board of Directors',
          documents: {
            create: [
              {
                documentType: 'Aadhaar Card',
                documentNumber: 'XXXX-XXXX-9012',
                uploadedBy: 'Admin',
              },
              {
                documentType: 'PAN Card',
                documentNumber: 'ABCDE1234F',
                uploadedBy: 'Admin',
              },
            ],
          },
        },
      },
    },
    include: { employee: true },
  });

  // Employee Account 1 (Amit Verma - Senior Site Engineer)
  const emp1User = await prisma.user.create({
    data: {
      email: 'amit.verma@swaatienterprises.in',
      userId: 'amit.v',
      passwordHash: employeePasswordHash,
      role: RoleType.EMPLOYEE,
      isActive: true,
      employee: {
        create: {
          employeeCode: 'EMP-102',
          userId: 'amit.v',
          name: 'Amit Verma',
          email: 'amit.verma@swaatienterprises.in',
          mobile: '+91 98220 12345',
          department: 'Technical & Operations',
          designation: 'Senior Site Engineer',
          joiningDate: new Date('2021-03-15'),
          employmentStatus: 'Active',
          active: true,
          avatar: 'AV',
          reportingManager: 'Shailendra Patil',
          documents: {
            create: [
              {
                documentType: 'Aadhaar Card',
                documentNumber: 'XXXX-XXXX-4589',
                uploadedBy: 'Admin',
              },
            ],
          },
        },
      },
    },
    include: { employee: true },
  });

  // Employee Account 2 (Rajesh Sharma - Sales Manager)
  const emp2User = await prisma.user.create({
    data: {
      email: 'rajesh.sharma@swaatienterprises.in',
      userId: 'rajesh.s',
      passwordHash: employeePasswordHash,
      role: RoleType.EMPLOYEE,
      isActive: true,
      employee: {
        create: {
          employeeCode: 'EMP-103',
          userId: 'rajesh.s',
          name: 'Rajesh Sharma',
          email: 'rajesh.sharma@swaatienterprises.in',
          mobile: '+91 97654 32109',
          department: 'Sales & Business Dev',
          designation: 'Sales & BD Manager',
          joiningDate: new Date('2022-06-01'),
          employmentStatus: 'Active',
          active: true,
          avatar: 'RS',
          reportingManager: 'Shailendra Patil',
          documents: {
            create: [
              {
                documentType: 'Driving License',
                documentNumber: 'MH-14-20180029312',
                uploadedBy: 'Admin',
              },
            ],
          },
        },
      },
    },
    include: { employee: true },
  });

  // Employee Account 3 (Pooja Sawant - Support Specialist)
  const emp3User = await prisma.user.create({
    data: {
      email: 'pooja.sawant@swaatienterprises.in',
      userId: 'pooja.s',
      passwordHash: employeePasswordHash,
      role: RoleType.EMPLOYEE,
      isActive: true,
      employee: {
        create: {
          employeeCode: 'EMP-104',
          userId: 'pooja.s',
          name: 'Pooja Sawant',
          email: 'pooja.sawant@swaatienterprises.in',
          mobile: '+91 94230 77889',
          department: 'Customer Support',
          designation: 'Customer Service Executive',
          joiningDate: new Date('2023-01-10'),
          employmentStatus: 'Active',
          active: true,
          avatar: 'PS',
          reportingManager: 'Shailendra Patil',
        },
      },
    },
    include: { employee: true },
  });

  // Deactivated Test Account (Sanjay Kulkarni)
  const deactivatedUser = await prisma.user.create({
    data: {
      email: 'sanjay.kulkarni@swaatienterprises.in',
      userId: 'sanjay.k',
      passwordHash: employeePasswordHash,
      role: RoleType.EMPLOYEE,
      isActive: false, // DEACTIVATED
      employee: {
        create: {
          employeeCode: 'EMP-105',
          userId: 'sanjay.k',
          name: 'Sanjay Kulkarni',
          email: 'sanjay.kulkarni@swaatienterprises.in',
          mobile: '+91 98811 00223',
          department: 'Site Execution',
          designation: 'Former Field Supervisor',
          joiningDate: new Date('2020-02-01'),
          employmentStatus: 'Inactive',
          active: false,
          avatar: 'SK',
          deactivatedAt: new Date('2026-06-30'),
          deactivatedBy: 'admin@swaatienterprises.in',
        },
      },
    },
    include: { employee: true },
  });

  // 4. Seed User Permissions
  console.log('🔒 Seeding User Permissions Matrix...');
  const allFeatures = ['dashboard', 'attendance', 'leave', 'tasks', 'leads', 'products', 'reports', 'notifications', 'messaging'];

  // Admin permissions (all enabled)
  for (const feat of allFeatures) {
    await prisma.userPermission.create({
      data: { userId: adminUser.id, featureKey: feat, enabled: true },
    });
  }

  // Amit Verma (Technical Staff: No Leads, No Reports)
  for (const feat of allFeatures) {
    const isEnabled = ['dashboard', 'attendance', 'leave', 'tasks', 'products', 'notifications', 'messaging'].includes(feat);
    await prisma.userPermission.create({
      data: { userId: emp1User.id, featureKey: feat, enabled: isEnabled },
    });
  }

  // Rajesh Sharma (Sales Staff: Has Leads & Reports)
  for (const feat of allFeatures) {
    await prisma.userPermission.create({
      data: { userId: emp2User.id, featureKey: feat, enabled: true },
    });
  }

  // Pooja Sawant (Support Staff: No Products, No Reports)
  for (const feat of allFeatures) {
    const isEnabled = ['dashboard', 'attendance', 'leave', 'tasks', 'leads', 'notifications', 'messaging'].includes(feat);
    await prisma.userPermission.create({
      data: { userId: emp3User.id, featureKey: feat, enabled: isEnabled },
    });
  }

  // 5. Seed Products & Document Library (Single Source of Truth)
  console.log('📦 Seeding Products & Versioned Document Library...');
  const prod1 = await prisma.product.create({
    data: {
      productCode: 'PROD-WP-101',
      name: 'Fosroc Waterproofing Membrane',
      category: 'Waterproofing Systems',
      brand: 'Fosroc',
      productType: 'Polymer Modified Cementitious Coating',
      subcategory: 'Basement & Terrace',
      status: 'Active',
      documents: {
        create: [
          {
            title: 'Technical Datasheet (TDS) - Fosroc Superguard',
            documentType: 'datasheet',
            fileName: 'Fosroc_Superguard_TDS_v2.1.pdf',
            fileUrl: '/datasheets/Fosroc_Superguard_TDS.pdf',
            fileSize: '1.4 MB',
            version: 'v2.1',
            isActive: true,
            uploadedBy: 'admin@swaatienterprises.in',
          },
        ],
      },
    },
  });

  const prod2 = await prisma.product.create({
    data: {
      productCode: 'PROD-WP-102',
      name: 'Dr. Fixit Newcoat ETP',
      category: 'Waterproofing Systems',
      brand: 'Dr. Fixit',
      productType: 'Elastomeric Terrace Coating',
      subcategory: 'Exposed Roof Slab',
      status: 'Active',
      documents: {
        create: [
          {
            title: 'Technical Specification Sheet',
            documentType: 'datasheet',
            fileName: 'DrFixit_Newcoat_ETP_TDS_v1.0.pdf',
            fileUrl: '/datasheets/DrFixit_Newcoat_TDS.pdf',
            fileSize: '1.1 MB',
            version: 'v1.0',
            isActive: true,
            uploadedBy: 'admin@swaatienterprises.in',
          },
        ],
      },
    },
  });

  const prod3 = await prisma.product.create({
    data: {
      productCode: 'PROD-EP-103',
      name: 'SWAATI EPOXY SL 2mm',
      category: 'Epoxy Flooring',
      brand: 'Swaati Systems',
      productType: 'Self-Levelling Heavy Duty Epoxy',
      subcategory: 'Industrial Cleanroom & Auto Shop',
      status: 'Active',
      documents: {
        create: [
          {
            title: 'Product Application Guide & TDS',
            documentType: 'datasheet',
            fileName: 'Swaati_Epoxy_SL_TDS_v1.2.pdf',
            fileUrl: '/datasheets/Swaati_Epoxy_SL_TDS.pdf',
            fileSize: '2.3 MB',
            version: 'v1.2',
            isActive: true,
            uploadedBy: 'admin@swaatienterprises.in',
          },
        ],
      },
    },
  });

  // 6. Seed Leads (Website Ingestion & Manual)
  console.log('📈 Seeding Leads Pipeline...');
  await prisma.lead.createMany({
    data: [
      {
        leadCode: 'LEAD-WEB-2026-001',
        leadName: 'Milind Soman (Project Head)',
        companyName: 'Godrej Properties Ltd',
        mobileNumber: '+91 98230 44123',
        email: 'm.soman@godrejproperties.com',
        location: 'Kalyani Nagar, Pune',
        productInterested: 'Waterproofing Systems (Terrace & Basement)',
        requirement: 'Complete membrane & crystalline waterproofing for 45,000 sq.ft podium slab.',
        source: 'website',
        leadAddedBy: 'Website Form (Auto)',
        status: LeadStatus.QUOTATION_SENT,
        priority: Priority.HIGH,
        assignedToId: emp2User.employee!.id,
        followUpDate: new Date('2026-08-25'),
      },
      {
        leadCode: 'LEAD-2026-002',
        leadName: 'Suresh Menon (Plant Maintenance Mgr)',
        companyName: 'Tata Motors Chinchwad Plant',
        mobileNumber: '+91 99221 88321',
        email: 'suresh.menon@tatamotors.com',
        location: 'MIDC Chinchwad, Pune',
        productInterested: 'Epoxy Flooring HD (Heavy Duty)',
        requirement: 'Anti-skid chemical resistant epoxy floor coating for Assembly Line 3.',
        source: 'whatsapp',
        leadAddedBy: 'rajesh.s',
        status: LeadStatus.CONTACTED,
        priority: Priority.HIGH,
        assignedToId: emp1User.employee!.id,
        followUpDate: new Date('2026-08-24'),
      },
    ],
  });

  // 7. Seed Tasks & Assignment History
  console.log('📋 Seeding Tasks & Assignments...');
  const task1 = await prisma.task.create({
    data: {
      taskCode: 'TSK-501',
      title: 'Godrej Emerald Bay - Moisture & Core Test',
      description: 'Conduct comprehensive dampness survey and submit joint inspection report.',
      priority: Priority.HIGH,
      status: TaskStatus.IN_PROGRESS,
      category: 'Site Survey',
      startDate: new Date('2026-08-18'),
      deadline: new Date('2026-08-24'),
      reminderTime: '1 day before',
      assignedToId: emp1User.employee!.id,
      assignedById: adminUser.employee!.id,
      comments: {
        create: [
          {
            author: 'Amit Verma',
            content: 'Core sampling scheduled for Monday 11:30 AM with Godrej site engineer.',
          },
        ],
      },
      history: {
        create: [
          {
            previousAssigneeId: null,
            newAssigneeId: emp1User.employee!.id,
            changedBy: 'admin@swaatienterprises.in',
          },
        ],
      },
    },
  });

  // 8. Seed Attendance Records
  console.log('⏰ Seeding Attendance History...');
  const todayMidnight = new Date('2026-08-22T00:00:00.000Z');
  await prisma.attendance.createMany({
    data: [
      {
        employeeId: adminUser.employee!.id,
        attendanceDate: todayMidnight,
        checkIn: '09:30 AM',
        checkOut: '06:30 PM',
        workingHours: '9.0 hrs',
        workingMinutes: 540,
        attendanceStatus: AttendanceStatus.PRESENT,
        isLate: false,
        lateMinutes: 0,
      },
      {
        employeeId: emp1User.employee!.id,
        attendanceDate: todayMidnight,
        checkIn: '10:25 AM',
        checkOut: '-',
        workingHours: 'In Progress',
        workingMinutes: 0,
        attendanceStatus: AttendanceStatus.LATE,
        isLate: true,
        lateMinutes: 25,
      },
      {
        employeeId: emp2User.employee!.id,
        attendanceDate: todayMidnight,
        checkIn: '09:50 AM',
        checkOut: '06:45 PM',
        workingHours: '8.9 hrs',
        workingMinutes: 535,
        attendanceStatus: AttendanceStatus.PRESENT,
        isLate: false,
        lateMinutes: 0,
      },
    ],
  });

  // 9. Seed Leave Requests
  console.log('🏖️ Seeding Leave Requests...');
  await prisma.leaveRequest.create({
    data: {
      employeeId: emp1User.employee!.id,
      leaveType: 'Casual Leave',
      startDate: new Date('2026-08-28'),
      endDate: new Date('2026-08-29'),
      totalDays: 2,
      reason: 'Attending family medical appointment and personal work.',
      status: LeaveStatus.APPROVED,
      reviewedBy: 'admin@swaatienterprises.in',
      reviewerRemarks: 'Approved. Please brief site handover before departure.',
      reviewedAt: new Date(),
    },
  });

  // 10. Seed Notifications
  console.log('🔔 Seeding Notifications...');
  await prisma.notification.createMany({
    data: [
      {
        userId: adminUser.id,
        type: 'website_lead',
        title: 'New Website Inquiry Received',
        message: 'Milind Soman (Godrej Properties) enquired for Waterproofing Systems via public website.',
        relatedType: 'Lead',
        isRead: false,
      },
      {
        userId: emp1User.id,
        type: 'task_assigned',
        title: 'New Task Assigned',
        message: '"Godrej Emerald Bay - Moisture & Core Test" assigned to you. Deadline: 24 Aug 2026.',
        relatedType: 'Task',
        relatedId: task1.id,
        isRead: false,
      },
      {
        userId: emp1User.id,
        type: 'late',
        title: 'Late Arrival Recorded',
        message: 'Checked in at 10:25 AM (25 mins after shift start 10:00 AM).',
        relatedType: 'Attendance',
        isRead: true,
      },
    ],
  });

  // 11. Seed Audit Logs
  console.log('📜 Seeding Audit Logs...');
  await prisma.auditLog.createMany({
    data: [
      {
        actorUserId: adminUser.id,
        action: 'EMPLOYEE_CREATED',
        entityType: 'Employee',
        entityId: emp1User.employee!.id,
        metadata: JSON.stringify({ name: 'Amit Verma', code: 'EMP-102', userId: 'amit.v' }),
      },
      {
        actorUserId: adminUser.id,
        action: 'DOCUMENT_UPLOADED',
        entityType: 'ProductDocument',
        entityId: prod1.id,
        metadata: JSON.stringify({ name: 'Fosroc_Superguard_TDS_v2.1.pdf', version: 'v2.1' }),
      },
    ],
  });

  // 12. Seed Languages & Interface Content Management Layer
  console.log('🌐 Seeding Content & Translation Management System...');
  const langEn = await prisma.language.create({
    data: { code: 'en', name: 'English', isEnabled: true, isDefault: true },
  });
  const langMr = await prisma.language.create({
    data: { code: 'mr', name: 'मराठी', isEnabled: true, isDefault: false },
  });
  const langHi = await prisma.language.create({
    data: { code: 'hi', name: 'हिंदी', isEnabled: true, isDefault: false },
  });

  const contentSeedData = [
    // Top Bar & Global
    { key: 'brand_title', module: 'global', type: 'text', en: 'Swaati Enterprises', mr: 'स्वाती एंटरप्रायझेस', hi: 'स्वाती एंटरप्राइजेज' },
    { key: 'crm_subtitle', module: 'global', type: 'text', en: 'Internal CRM & Business Operating System', mr: 'अंतर्गत सीआरएम आणि व्यवसाय प्रणाली', hi: 'आंतरिक सीआरएम एवं व्यावसायिक संचालन प्रणाली' },
    { key: 'check_in', module: 'attendance', type: 'button', en: 'Check In', mr: 'चेक इन', hi: 'चेक इन' },
    { key: 'check_out', module: 'attendance', type: 'button', en: 'Check Out', mr: 'चेक आउट', hi: 'चेक आउट' },
    { key: 'checked_in', module: 'attendance', type: 'label', en: 'Checked In', mr: 'चेक इन झाले', hi: 'चेक इन हो चुका है' },
    { key: 'mark_check_in', module: 'attendance', type: 'button', en: 'Mark Check-In', mr: 'चेक-इन नोंदवा', hi: 'चेक-इन दर्ज करें' },
    { key: 'mark_check_out', module: 'attendance', type: 'button', en: 'Mark Check-Out', mr: 'चेक-आउट नोंदवा', hi: 'चेक-आउट दर्ज करें' },
    { key: 'logout', module: 'navigation', type: 'button', en: 'Logout', mr: 'लॉगआउट', hi: 'लॉगआउट' },
    { key: 'my_profile', module: 'settings', type: 'link', en: 'My Profile', mr: 'माझे प्रोफाइल', hi: 'मेरा प्रोफाइल' },
    { key: 'system_settings', module: 'settings', type: 'link', en: 'System Settings', mr: 'सिस्टम सेटिंग्ज', hi: 'सिस्टम सेटिंग्स' },
    { key: 'notifications', module: 'notifications', type: 'title', en: 'Notifications', mr: 'सूचना', hi: 'सूचनाएं' },
    { key: 'mark_all_read', module: 'notifications', type: 'button', en: 'Mark All as Read', mr: 'सर्व वाचले म्हणून चिन्हांकित करा', hi: 'सभी को पढ़ा हुआ चिह्नित करें' },
    { key: 'mark_read', module: 'notifications', type: 'button', en: 'Mark Read', mr: 'वाचले म्हणून चिन्हांकित करा', hi: 'पढ़ा हुआ चिह्नित करें' },
    { key: 'all_caught_up', module: 'notifications', type: 'text', en: "You're all caught up.", mr: 'सर्व सूचना वाचल्या गेल्या आहेत.', hi: 'आपकी सभी सूचनाएं पढ़ी जा चुकी हैं।' },

    // Navigation
    { key: 'nav_dashboard', module: 'navigation', type: 'nav', en: 'Dashboard', mr: 'डॅशबोर्ड', hi: 'डैशबोर्ड' },
    { key: 'nav_employees', module: 'navigation', type: 'nav', en: 'Users / Employees', mr: 'कर्मचारी व्यवस्थापन', hi: 'उपयोगकर्ता / कर्मचारी' },
    { key: 'nav_attendance', module: 'navigation', type: 'nav', en: 'Daily Attendance', mr: 'दैनिक उपस्थिती', hi: 'दैनिक उपस्थिति' },
    { key: 'nav_leave', module: 'navigation', type: 'nav', en: 'Leave Management', mr: 'रजा व्यवस्थापन', hi: 'अवकाश प्रबंधन' },
    { key: 'nav_tasks', module: 'navigation', type: 'nav', en: 'Tasks', mr: 'कार्ये / कामे', hi: 'कार्य सूची' },
    { key: 'nav_leads', module: 'navigation', type: 'nav', en: 'Leads & Enquiries', mr: 'लीड्स आणि चौकशी', hi: 'लीड्स एवं पूछताछ' },
    { key: 'nav_products', module: 'navigation', type: 'nav', en: 'Product Documents', mr: 'उत्पादन डेटाशीट्स', hi: 'उत्पाद दस्तावेज़' },
    { key: 'nav_reports', module: 'navigation', type: 'nav', en: 'Reports & Payroll', mr: 'अहवाल आणि वेतन', hi: 'रिपोर्ट्स एवं पेरोल' },
    { key: 'nav_messages', module: 'navigation', type: 'nav', en: 'Messages', mr: 'संदेश', hi: 'संदेश' },
    { key: 'nav_settings', module: 'navigation', type: 'nav', en: 'Settings', mr: 'सेटिंग्ज', hi: 'सेटिंग्स' },

    // Hierarchical Navigation Keys
    { key: 'navigation.dashboard', module: 'navigation', type: 'nav', en: 'Dashboard', mr: 'डॅशबोर्ड', hi: 'डैशबोर्ड' },
    { key: 'navigation.employees', module: 'navigation', type: 'nav', en: 'Users / Employees', mr: 'कर्मचारी व्यवस्थापन', hi: 'उपयोगकर्ता / कर्मचारी' },
    { key: 'navigation.attendance', module: 'navigation', type: 'nav', en: 'Daily Attendance', mr: 'दैनिक उपस्थिती', hi: 'दैनिक उपस्थिति' },
    { key: 'navigation.leave', module: 'navigation', type: 'nav', en: 'Leave Management', mr: 'रजा व्यवस्थापन', hi: 'अवकाश प्रबंधन' },
    { key: 'navigation.tasks', module: 'navigation', type: 'nav', en: 'Tasks', mr: 'कार्ये / कामे', hi: 'कार्य सूची' },
    { key: 'navigation.leads', module: 'navigation', type: 'nav', en: 'Leads & Enquiries', mr: 'लीड्स आणि चौकशी', hi: 'लीड्स एवं पूछताछ' },
    { key: 'navigation.products', module: 'navigation', type: 'nav', en: 'Product Documents', mr: 'उत्पादन डेटाशीट्स', hi: 'उत्पाद दस्तावेज़' },
    { key: 'navigation.reports', module: 'navigation', type: 'nav', en: 'Reports & Payroll', mr: 'अहवाल आणि वेतन', hi: 'रिपोर्ट्स एवं पेरोल' },
    { key: 'navigation.messages', module: 'navigation', type: 'nav', en: 'Messages', mr: 'संदेश', hi: 'संदेश' },
    { key: 'navigation.settings', module: 'navigation', type: 'nav', en: 'Settings', mr: 'सेटिंग्ज', hi: 'सेटिंग्स' },
    { key: 'navigation.logout', module: 'navigation', type: 'nav', en: 'Logout', mr: 'लॉगआउट', hi: 'लॉगआउट' },

    // Buttons & Actions
    { key: 'btn_create_task', module: 'tasks', type: 'button', en: 'Create Task', mr: 'नवीन कार्य जोडा', hi: 'नया कार्य जोड़ें' },
    { key: 'tasks.create.button', module: 'tasks', type: 'button', en: 'Create Task', mr: 'नवीन कार्य जोडा', hi: 'नया कार्य जोड़ें' },
    { key: 'btn_add_lead', module: 'leads', type: 'button', en: 'Add Lead', mr: 'नवीन लीड जोडा', hi: 'नई लीड जोड़ें' },
    { key: 'leads.create.button', module: 'leads', type: 'button', en: 'Add Lead', mr: 'नवीन लीड जोडा', hi: 'नई लीड जोड़ें' },
    { key: 'btn_add_employee', module: 'employees', type: 'button', en: 'Add Employee', mr: 'कर्मचारी जोडा', hi: 'कर्मचारी जोड़ें' },
    { key: 'btn_apply_leave', module: 'leave', type: 'button', en: 'Apply for Leave', mr: 'रजेसाठी अर्ज करा', hi: 'अवकाश हेतु आवेदन करें' },
    { key: 'btn_upload_document', module: 'products', type: 'button', en: 'Upload Datasheet', mr: 'डेटाशीट अपलोड करा', hi: 'डेटाशीट अपलोड करें' },
    { key: 'btn_replace_document', module: 'products', type: 'button', en: 'Replace Document', mr: 'दस्तऐवज बदला', hi: 'दस्तावेज़ बदलें' },
    { key: 'documents.download', module: 'products', type: 'button', en: 'Download', mr: 'डाउनलोड', hi: 'डाउनलोड' },
    { key: 'documents.replace', module: 'products', type: 'button', en: 'Replace', mr: 'बदला', hi: 'बदलें' },
    { key: 'documents.add_document', module: 'products', type: 'button', en: 'Add Document', mr: 'दस्तऐवज जोडा', hi: 'दस्तावेज़ जोड़ें' },
    { key: 'btn_save', module: 'global', type: 'button', en: 'Save Changes', mr: 'बदल जतन करा', hi: 'परिवर्तन सहेजें' },
    { key: 'global.save', module: 'global', type: 'button', en: 'Save Changes', mr: 'बदल जतन करा', hi: 'परिवर्तन सहेजें' },
    { key: 'btn_cancel', module: 'global', type: 'button', en: 'Cancel', mr: 'रद्द करा', hi: 'रद्द करें' },
    { key: 'global.cancel', module: 'global', type: 'button', en: 'Cancel', mr: 'रद्द करा', hi: 'रद्द करें' },
    { key: 'btn_confirm', module: 'global', type: 'button', en: 'Confirm', mr: 'पुष्टी करा', hi: 'पुष्टि करें' },
    { key: 'global.confirm', module: 'global', type: 'button', en: 'Confirm', mr: 'पुष्टी करा', hi: 'पुष्टि करें' },
    { key: 'btn_approve', module: 'global', type: 'button', en: 'Approve', mr: 'मंजूर करा', hi: 'स्वीकृत करें' },
    { key: 'global.approve', module: 'global', type: 'button', en: 'Approve', mr: 'मंजूर करा', hi: 'स्वीकृत करें' },
    { key: 'btn_reject', module: 'global', type: 'button', en: 'Reject', mr: 'नाकारा', hi: 'अस्वीकृत करें' },
    { key: 'global.reject', module: 'global', type: 'button', en: 'Reject', mr: 'नाकारा', hi: 'अस्वीकृत करें' },
    { key: 'btn_send_message', module: 'messages', type: 'button', en: 'Send Message', mr: 'संदेश पाठवा', hi: 'संदेश भेजें' },
    { key: 'global.send_message', module: 'messages', type: 'button', en: 'Send Message', mr: 'संदेश पाठवा', hi: 'संदेश भेजें' },

    // Page Titles & Descriptions
    { key: 'tasks.page.title', module: 'tasks', type: 'title', en: 'Team Tasks & Work Orders', mr: 'संघाची कार्ये आणि वर्क ऑर्डर्स', hi: 'टीम कार्य एवं कार्य आदेश' },
    { key: 'tasks.page.subtitle', module: 'tasks', type: 'subtitle', en: 'Assign site inspections, testing, product demos and monitor project execution deadlines.', mr: 'साइट निरीक्षण, चाचणी, उत्पादन प्रात्यक्षिके नियुक्त करा आणि मुदतीचे निरीक्षण करा.', hi: 'साइट निरीक्षण, परीक्षण, उत्पाद प्रदर्शन सौंपें और समयसीमा की निगरानी करें।' },
    { key: 'leads.page.title', module: 'leads', type: 'title', en: 'Leads & Business Inquiries', mr: 'लीड्स आणि व्यावसायिक चौकशी', hi: 'लीड्स एवं व्यावसायिक पूछताछ' },
    { key: 'leads.page.subtitle', module: 'leads', type: 'subtitle', en: 'Manage construction chemicals, waterproofing and structural repair inquiries.', mr: 'बांधकाम रसायने, वॉटरप्रूफिंग आणि स्ट्रक्चरल दुरुस्तीच्या चौकशी व्यवस्थापित करा.', hi: 'निर्माण रसायन, वॉटरप्रूफिंग और संरचनात्मक मरम्मत पूछताछ प्रबंधित करें।' },
    { key: 'documents.page.title', module: 'products', type: 'title', en: 'Product Documents & Technical Library', mr: 'उत्पादन दस्तऐवज आणि तांत्रिक वाचनालय', hi: 'उत्पाद दस्तावेज़ एवं तकनीकी पुस्तकालय' },
    { key: 'documents.page.subtitle', module: 'products', type: 'subtitle', en: 'Manage datasheets (TDS), brochures, specifications, and test certificates in a centralized table view.', mr: 'केंद्रीकृत टेबल दृश्यात डेटाशीट्स (TDS), माहितीपत्रके, तपशील आणि चाचणी प्रमाणपत्रे व्यवस्थापित करा.', hi: 'केंद्रीकृत तालिका दृश्य में डेटाशीट (TDS), ब्रोशर, विनिर्देश और परीक्षण प्रमाण पत्र प्रबंधित करें।' },

    // Placeholders & Search
    { key: 'tasks.search.placeholder', module: 'tasks', type: 'placeholder', en: 'Search tasks by title, code, or assignee...', mr: 'शीर्षक, कोड किंवा नियुक्त व्यक्तीनुसार कार्ये शोधा...', hi: 'शीर्षक, कोड या सौंपे गए व्यक्ति द्वारा कार्य खोजें...' },
    { key: 'leads.search.placeholder', module: 'leads', type: 'placeholder', en: 'Search by client name, company, location, or product...', mr: 'ग्राहकाचे नाव, कंपनी, स्थान किंवा उत्पादनानुसार शोधा...', hi: 'ग्राहक का नाम, कंपनी, स्थान या उत्पाद द्वारा खोजें...' },
    { key: 'documents.search.placeholder', module: 'products', type: 'placeholder', en: 'Search by product name, code, brand, or category...', mr: 'उत्पादनाचे नाव, कोड, ब्रँड किंवा श्रेणीनुसार शोधा...', hi: 'उत्पाद का नाम, कोड, ब्रांड या श्रेणी द्वारा खोजें...' },

    // Empty States
    { key: 'empty_tasks', module: 'tasks', type: 'message', en: 'No tasks assigned yet.', mr: 'कोणतीही कामे नियुक्त केलेली नाहीत.', hi: 'कोई कार्य अभी सौंपा नहीं गया है।' },
    { key: 'tasks.empty.message', module: 'tasks', type: 'message', en: 'No tasks found.', mr: 'कोणतीही कार्ये आढळली नाहीत.', hi: 'कोई कार्य नहीं मिला।' },
    { key: 'empty_leads', module: 'leads', type: 'message', en: 'No leads found.', mr: 'कोणतीही लीड सापडली नाही.', hi: 'कोई लीड नहीं मिली।' },
    { key: 'leads.empty.message', module: 'leads', type: 'message', en: 'No leads found.', mr: 'कोणतीही लीड सापडली नाही.', hi: 'कोई लीड नहीं मिली।' },
    { key: 'empty_documents', module: 'products', type: 'message', en: 'No product documents uploaded yet.', mr: 'कोणतीही उत्पादन कागदपत्रे अपलोड केलेली नाहीत.', hi: 'कोई उत्पाद दस्तावेज़ अपलोड नहीं हुआ है।' },
    { key: 'documents.empty.message', module: 'products', type: 'message', en: 'No product documents found.', mr: 'कोणतीही उत्पादन कागदपत्रे आढळली नाहीत.', hi: 'कोई उत्पाद दस्तावेज़ नहीं मिला।' },
    { key: 'empty_leaves', module: 'leave', type: 'message', en: 'No leave requests submitted.', mr: 'कोणताही रजेचा अर्ज नाही.', hi: 'कोई अवकाश आवेदन प्रस्तुत नहीं किया गया।' },
    { key: 'empty_messages', module: 'messages', type: 'message', en: 'No conversation selected.', mr: 'कोणताही संवाद निवडलेला नाही.', hi: 'कोई वार्तालाप चयनित नहीं है।' },

    // Statuses
    { key: 'status_present', module: 'attendance', type: 'status', en: 'Present', mr: 'हजर', hi: 'उपस्थित' },
    { key: 'status_absent', module: 'attendance', type: 'status', en: 'Absent', mr: 'गैरहजर', hi: 'अनुपस्थित' },
    { key: 'status_late', module: 'attendance', type: 'status', en: 'Late', mr: 'उशीरा', hi: 'विलंब' },
    { key: 'status_half_day', module: 'attendance', type: 'status', en: 'Half Day', mr: 'अर्धा दिवस', hi: 'आधा दिन' },
    { key: 'status_on_leave', module: 'attendance', type: 'status', en: 'On Leave', mr: 'रजेवर', hi: 'अवकाश पर' },
    { key: 'status_holiday', module: 'attendance', type: 'status', en: 'Holiday', mr: 'सुट्टी', hi: 'छुट्टी' },
    { key: 'status_weekly_off', module: 'attendance', type: 'status', en: 'Weekly Off', mr: 'साप्ताहिक सुट्टी', hi: 'साप्ताहिक अवकाश' },

    // Permissions
    { key: 'permission_denied', module: 'global', type: 'message', en: "You don't have permission to perform this action.", mr: 'तुम्हाला ही कृती करण्याची परवानगी नाही.', hi: 'आपको यह क्रिया करने की अनुमति नहीं है।' },
    { key: 'access_restricted', module: 'global', type: 'message', en: 'This feature is currently not active for your account. Please contact your Admin.', mr: 'हे वैशिष्ट्य सध्या तुमच्या खात्यासाठी सक्रिय नाही. कृपया प्रशासकाशी संपर्क साधा.', hi: 'यह सुविधा वर्तमान में आपके खाते के लिए सक्रिय नहीं है। कृपया व्यवस्थापक से संपर्क करें।' },
  ];

  for (const item of contentSeedData) {
    const ci = await prisma.contentItem.create({
      data: {
        contentKey: item.key,
        module: item.module,
        contentType: item.type,
        isActive: true,
        createdBy: 'system',
      },
    });

    // English
    if (item.en) {
      await prisma.contentTranslation.create({
        data: {
          contentItemId: ci.id,
          languageId: langEn.id,
          value: item.en,
          status: 'published',
          createdBy: 'system',
        },
      });
      await prisma.contentVersion.create({
        data: {
          contentItemId: ci.id,
          languageId: langEn.id,
          version: 1,
          value: item.en,
          status: 'published',
          changedBy: 'system',
        },
      });
    }

    // Marathi
    if (item.mr) {
      await prisma.contentTranslation.create({
        data: {
          contentItemId: ci.id,
          languageId: langMr.id,
          value: item.mr,
          status: 'published',
          createdBy: 'system',
        },
      });
      await prisma.contentVersion.create({
        data: {
          contentItemId: ci.id,
          languageId: langMr.id,
          version: 1,
          value: item.mr,
          status: 'published',
          changedBy: 'system',
        },
      });
    }

    // Hindi
    if (item.hi) {
      await prisma.contentTranslation.create({
        data: {
          contentItemId: ci.id,
          languageId: langHi.id,
          value: item.hi,
          status: 'published',
          createdBy: 'system',
        },
      });
      await prisma.contentVersion.create({
        data: {
          contentItemId: ci.id,
          languageId: langHi.id,
          version: 1,
          value: item.hi,
          status: 'published',
          changedBy: 'system',
        },
      });
    }
  }

  console.log('✅ Swaati Enterprises Operational Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
