export type RoleType = 'ADMIN' | 'OPERATION_HEAD' | 'SALES' | 'ACCOUNTANT' | 'WAREHOUSE_MANAGER';
export const RoleType = {
  ADMIN: 'ADMIN' as RoleType,
  OPERATION_HEAD: 'OPERATION_HEAD' as RoleType,
  SALES: 'SALES' as RoleType,
  ACCOUNTANT: 'ACCOUNTANT' as RoleType,
  WAREHOUSE_MANAGER: 'WAREHOUSE_MANAGER' as RoleType,
};

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export const Priority = {
  LOW: 'LOW' as Priority,
  MEDIUM: 'MEDIUM' as Priority,
  HIGH: 'HIGH' as Priority,
  URGENT: 'URGENT' as Priority,
};

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
export const TaskStatus = {
  TODO: 'TODO' as TaskStatus,
  IN_PROGRESS: 'IN_PROGRESS' as TaskStatus,
  COMPLETED: 'COMPLETED' as TaskStatus,
  OVERDUE: 'OVERDUE' as TaskStatus,
  CANCELLED: 'CANCELLED' as TaskStatus,
};

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'FOLLOW_UP'
  | 'QUALIFIED'
  | 'QUOTATION_SENT'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST';
export const LeadStatus = {
  NEW: 'NEW' as LeadStatus,
  CONTACTED: 'CONTACTED' as LeadStatus,
  FOLLOW_UP: 'FOLLOW_UP' as LeadStatus,
  QUALIFIED: 'QUALIFIED' as LeadStatus,
  QUOTATION_SENT: 'QUOTATION_SENT' as LeadStatus,
  NEGOTIATION: 'NEGOTIATION' as LeadStatus,
  WON: 'WON' as LeadStatus,
  LOST: 'LOST' as LeadStatus,
};

export type AttendanceStatus =
  | 'PRESENT'
  | 'LATE'
  | 'HALF_DAY'
  | 'ABSENT'
  | 'ON_LEAVE'
  | 'HOLIDAY'
  | 'WEEKLY_OFF';
export const AttendanceStatus = {
  PRESENT: 'PRESENT' as AttendanceStatus,
  LATE: 'LATE' as AttendanceStatus,
  HALF_DAY: 'HALF_DAY' as AttendanceStatus,
  ABSENT: 'ABSENT' as AttendanceStatus,
  ON_LEAVE: 'ON_LEAVE' as AttendanceStatus,
  HOLIDAY: 'HOLIDAY' as AttendanceStatus,
  WEEKLY_OFF: 'WEEKLY_OFF' as AttendanceStatus,
};

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export const LeaveStatus = {
  PENDING: 'PENDING' as LeaveStatus,
  APPROVED: 'APPROVED' as LeaveStatus,
  REJECTED: 'REJECTED' as LeaveStatus,
  CANCELLED: 'CANCELLED' as LeaveStatus,
};
