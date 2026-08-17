"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding PostgreSQL Database for Swaati Enterprises...');
    // 1. Password Hashes for Demo Accounts
    const adminPasswordHash = await bcryptjs_1.default.hash('Admin@123', 10);
    const managerPasswordHash = await bcryptjs_1.default.hash('Manager@123', 10);
    const employeePasswordHash = await bcryptjs_1.default.hash('Employee@123', 10);
    // 2. Create Users & Employees
    const adminUser = await prisma.user.upsert({
        where: { email: 'admin@swaatienterprises.in' },
        update: {},
        create: {
            email: 'admin@swaatienterprises.in',
            passwordHash: adminPasswordHash,
            role: client_1.RoleType.ADMIN,
            isActive: true,
            employee: {
                create: {
                    employeeCode: 'EMP-101',
                    name: 'Shailendra Patil',
                    email: 'shailendra.patil@swaatienterprises.in',
                    mobile: '+91 93700 11133',
                    department: 'Executive Management',
                    designation: 'Founder & CEO',
                    joiningDate: new Date('2006-04-15'),
                    status: 'Active',
                    avatar: 'SP',
                },
            },
        },
        include: { employee: true },
    });
    const managerUser = await prisma.user.upsert({
        where: { email: 'manager@swaatienterprises.in' },
        update: {},
        create: {
            email: 'manager@swaatienterprises.in',
            passwordHash: managerPasswordHash,
            role: client_1.RoleType.MANAGER,
            isActive: true,
            employee: {
                create: {
                    employeeCode: 'EMP-102',
                    name: 'Rajesh Sharma',
                    email: 'rajesh.sharma@swaatienterprises.in',
                    mobile: '+91 98220 12345',
                    department: 'Sales & Business Dev',
                    designation: 'Sales Manager',
                    joiningDate: new Date('2015-08-10'),
                    status: 'Active',
                    avatar: 'RS',
                },
            },
        },
        include: { employee: true },
    });
    const employeeUser = await prisma.user.upsert({
        where: { email: 'employee@swaatienterprises.in' },
        update: {},
        create: {
            email: 'employee@swaatienterprises.in',
            passwordHash: employeePasswordHash,
            role: client_1.RoleType.EMPLOYEE,
            isActive: true,
            employee: {
                create: {
                    employeeCode: 'EMP-104',
                    name: 'Amit Verma',
                    email: 'amit.verma@swaatienterprises.in',
                    mobile: '+91 97654 32109',
                    department: 'Technical & Operations',
                    designation: 'Senior Site Engineer',
                    joiningDate: new Date('2020-11-15'),
                    status: 'Active',
                    avatar: 'AV',
                },
            },
        },
        include: { employee: true },
    });
    const empManager = managerUser.employee;
    const empWorker = employeeUser.employee;
    const empAdmin = adminUser.employee;
    // 3. Seed Products
    await prisma.product.deleteMany({});
    await prisma.product.createMany({
        data: [
            {
                productCode: 'PROD-01',
                name: 'Fosroc Waterproofing Membrane',
                category: 'Waterproofing Systems',
                brand: 'Fosroc',
                status: 'Active',
                datasheetUrl: 'Fosroc_Superguard_TDS.pdf',
            },
            {
                productCode: 'PROD-02',
                name: 'Dr. Fixit Newcoat ETP',
                category: 'Waterproofing Systems',
                brand: 'Dr. Fixit',
                status: 'Active',
                datasheetUrl: 'DrFixit_Newcoat_TDS.pdf',
            },
            {
                productCode: 'PROD-03',
                name: 'SWAATI EPOXY SL 2mm',
                category: 'Epoxy Flooring',
                brand: 'Swaati Systems',
                status: 'Active',
                datasheetUrl: 'Swaati_Epoxy_SL_TDS.pdf',
            },
        ],
    });
    // 4. Seed Leads
    await prisma.lead.deleteMany({});
    await prisma.lead.createMany({
        data: [
            {
                leadCode: 'LEAD-2026-001',
                customerCompany: 'Godrej Properties Ltd',
                contactPerson: 'Milind Soman (Project Head)',
                phone: '+91 98230 44123',
                email: 'm.soman@godrejproperties.com',
                productInterested: 'Waterproofing Systems (Terrace & Basement)',
                requirement: 'Complete membrane & crystalline waterproofing for 45,000 sq.ft podium slab.',
                source: 'Website Enquiry',
                estimatedValue: 4500000,
                status: client_1.LeadStatus.QUOTATION_SENT,
                assignedToId: empManager.id,
                followUpDate: new Date('2026-08-15'),
            },
            {
                leadCode: 'LEAD-2026-002',
                customerCompany: 'Tata Motors Chinchwad Plant',
                contactPerson: 'Suresh Menon (Plant Maintenance Mgr)',
                phone: '+91 99221 88321',
                email: 'suresh.menon@tatamotors.com',
                productInterested: 'Epoxy Flooring HD (Heavy Duty)',
                requirement: 'Anti-skid chemical resistant epoxy floor coating for Assembly Line 3.',
                source: 'Direct Referral',
                estimatedValue: 1850000,
                status: client_1.LeadStatus.CONTACTED,
                assignedToId: empWorker.id,
                followUpDate: new Date('2026-08-14'),
            },
        ],
    });
    // 5. Seed Tasks
    await prisma.task.deleteMany({});
    await prisma.task.create({
        data: {
            taskCode: 'TSK-501',
            title: 'Site Inspection at Godrej Emerald Bay Podium Slab',
            description: 'Conduct core inspection and dampness test prior to applying crystalline waterproofing membrane.',
            priority: client_1.Priority.HIGH,
            status: client_1.TaskStatus.IN_PROGRESS,
            category: 'Site Survey',
            startDate: new Date('2026-08-12'),
            dueDate: new Date('2026-08-14'),
            assignedToId: empWorker.id,
            createdById: empManager.id,
        },
    });
    // 6. Seed Attendance
    await prisma.attendance.deleteMany({});
    await prisma.attendance.create({
        data: {
            date: new Date('2026-08-13'),
            checkIn: '09:00 AM',
            checkOut: '06:15 PM',
            workingHours: '9.2 hrs',
            status: client_1.AttendanceStatus.PRESENT,
            employeeId: empAdmin.id,
        },
    });
    console.log('✅ PostgreSQL Database seeded successfully with demo users!');
}
main()
    .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
