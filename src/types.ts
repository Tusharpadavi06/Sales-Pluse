export type UserRole = 'Sales Person' | 'Branch Head' | 'Admin';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  branch_ids: string[];
  updated_at?: string;
}

export interface Target {
  id: string;
  employee_id: string;
  customer_name: string;
  branch: string;
  unit: string;
  year: string;
  month: string; // The "Start Month" usually, or specific if needed
  target_value: number;
  created_at?: string;
}

export interface ActualEntry {
  id: string;
  target_id: string;
  month: string; // MM format or full name
  actual_value: number;
  gap_value?: number;
  updated_at?: string;
}

export interface SalesDatabaseEntry {
  id: string;
  customer_name: string;
  unit_name: string;
  month: string;
  year: string;
  target_amount: number;
  actual_amount: number;
  salesperson_id: string;
  branch_id: string;
  created_at: string;
}

export interface DashboardFilters {
  customer: string;
  year: string;
  month: string;
  unit: string;
  branch: string;
  employee: string;
}
