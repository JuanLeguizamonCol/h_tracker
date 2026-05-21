export type AppRole = 'admin' | 'employee';

export interface Employee {
  id: string;
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  supervisor_id: string | null;
  title: string | null;
  department: string | null;
  business_unit: string | null;
  created_at: string;
  updated_at: string;
  // Personal Information
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  gender: string | null;
  personal_email: string | null;
  personal_phone: string | null;
  id_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  // Location
  country: string | null;
  state: string | null;
  city: string | null;
  timezone: string | null;
  street_address: string | null;
  zip_code: string | null;
  work_mode: string | null;
  // Corporate
  corporate_phone: string | null;
  employee_code: string | null;
  employment_type: string | null;
  start_date: string | null;
  end_date: string | null;
  employment_status: string | null;
  billing_currency: string | null;
  notes: string | null;
  must_change_password: boolean;
}

export interface SkillCatalog {
  id: string;
  name: string;
  category: string;
  created_at: string;
}

export interface EmployeeSkill {
  id: string;
  employee_id: string;
  skill_catalog_id: string | null;
  skill_name: string;
  category: string;
  proficiency_level: number; // 1=Beginner, 2=Intermediate, 3=Advanced, 4=Expert
  years_experience: number | null;
  certified: boolean;
  certificate_name: string | null;
  cert_expiry_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  manager_name: string | null;
  manager_email: string | null;
  manager_phone: string | null;
  client_code: string | null;
  salutation: string | null;
  first_name: string | null;
  middle_initial: string | null;
  last_name: string | null;
  job_title: string | null;
  main_phone: string | null;
  work_phone: string | null;
  mobile: string | null;
  main_email: string | null;
  street_address_1: string | null;
  street_address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  rep: string | null;
  payment_terms: string | null;
  team_member: string | null;
  notes: string | null;
  industry: string | null;
  website: string | null;
  tax_id: string | null;
  referral_source: string | null;
  referred_by: string | null;
  acquisition_date: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  billing_rate: number | null;
  billing_currency: string | null;
  billing_email: string | null;
  created_at: string;
  // FreshSales CRM
  freshsales_id: number | null;
  crm_synced_at: string | null;
  crm_source: string | null;
}

export interface FreshSalesAccount {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  industry: string | null;
}

export interface FreshSalesAccountsResponse {
  accounts: FreshSalesAccount[];
  total: number;
  error?: string;
}

export interface FreshSalesTestResponse {
  success: boolean;
  user?: string;
  domain?: string;
  error?: string;
}

export interface FreshSalesImportResponse {
  imported: number;
  updated: number;
  skipped: number;
  errors: { id: number; error: string }[];
}

export interface Project {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_internal: boolean;
  project_code: string | null;
  area_category: string | null;
  business_unit: string | null;
  manager_id: string | null;
  manager_name: string | null;
  referral_id: string | null;
  referral_type: string | null;
  referral_value: number | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  owner_company: string;
  billing_period: string;
  billing_day_of_period: number | null;
  custom_period_days: number | null;
  billing_anchor_date: string | null;
}

export interface ProjectCategory {
  id: string;
  type: string;
  value: string;
  active: boolean;
}

export interface ProjectAssignment {
  id: string;
  user_id: string;
  employee_name: string;
  project_id: string;
  role_id: string | null;
  role_name: string | null;
  rate: number | null;
}

export interface ProjectRole {
  id: string;
  project_id: string;
  name: string;
  hourly_rate_usd: number;
  created_at: string;
}

export type TimeEntryStatus = 'normal' | 'on_hold';

export interface TimeEntry {
  id: string;
  user_id: string;
  project_id: string;
  role_id: string | null;
  date: string;
  hours: number;
  billable: boolean;
  notes: string | null;
  status: TimeEntryStatus;
  created_at: string;
}

export interface EmployeeProject {
  id: string;
  user_id: string;
  project_id: string;
  role_id: string | null;
  assigned_at: string;
  assigned_by: string | null;
}

export interface EmployeeProjectWithDetails extends EmployeeProject {
  project_name: string;
  client_name: string;
  client_id: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled' | 'voided';

export interface Invoice {
  id: string;
  project_id: string;
  status: InvoiceStatus;
  subtotal: number;
  discount: number;
  total: number;
  cap_amount: number | null;
  notes: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  owner_company: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceExpense {
  id: string;
  invoice_id: string;
  date: string;
  professional: string | null;
  vendor: string | null;
  description: string | null;
  category: string;
  amount_usd: number;
  payment_source: string | null;
  receipt_attached: boolean;
  notes: string | null;
  created_at: string;
}

export interface InvoiceEditLine {
  id: string;
  user_id: string;
  employee_name: string;
  title: string | null;
  role: string | null;
  hours: number;
  hourly_rate: number;
  discount_type: 'amount' | 'percent' | null;
  discount_value: number;
  amount: number;
  original_hours?: number;
}

export interface InvoiceEditData {
  invoice: Invoice;
  client: { id: string; name: string; email: string | null; phone: string | null } | null;
  project: { id: string; name: string; client_id: string } | null;
  lines: InvoiceEditLine[];
  expenses: InvoiceExpense[];
}

export interface InvoiceLinePatch {
  id: string;
  hours?: number;
  rate_snapshot?: number;
  discount_type?: 'amount' | 'percent' | null;
  discount_value?: number;
}

export interface InvoiceExpensePatch {
  id: string | null;
  invoice_id?: string;
  date?: string;
  professional?: string | null;
  vendor?: string | null;
  description?: string | null;
  category?: string;
  amount_usd?: number;
  payment_source?: string | null;
  receipt_attached?: boolean;
  notes?: string | null;
}

export interface OnHoldEntryPatch {
  line_id: string;
  employee_name: string;
  original_hours: number;
  billed_hours: number;
  rate: number;
  has_on_hold: boolean;
  reason?: string | null;
}

export interface InvoicePatch {
  status?: string;
  cap_amount?: number | null;
  invoice_number?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  notes?: string | null;
  signatory_name?: string | null;
  signatory_title?: string | null;
  owner_company?: string | null;
  lines?: InvoiceLinePatch[];
  expenses?: InvoiceExpensePatch[];
  on_hold_entries?: OnHoldEntryPatch[];
}

export interface InvoiceHoursOnHold {
  id: string;
  invoice_id: string;
  line_id: string;
  employee_name: string;
  original_hours: number;
  billed_hours: number;
  on_hold_hours: number;
  rate: number;
  on_hold_amount: number;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceManualLine {
  id: string;
  invoice_id: string;
  person_name: string;
  hours: number;
  rate_usd: number;
  description: string | null;
  line_total: number;
  created_at: string;
}

export interface InvoiceFee {
  id: string;
  invoice_id: string;
  label: string;
  quantity: number;
  unit_price_usd: number;
  description: string | null;
  fee_total: number;
  created_at: string;
}

export interface InvoiceFeeAttachment {
  id: string;
  fee_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  created_at: string;
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  user_id: string;
  employee_name: string;
  role_name: string | null;
  hours: number;
  rate_snapshot: number;
  amount: number;
  discount_type: string | null;
  discount_value: number;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface AssignableEmployeeSkill {
  name: string;
  category: string;
  level: number;
  level_label: string;
  years: number | null;
}

export interface AssignableEmployee {
  id: string;
  name: string;
  title: string | null;
  skills: AssignableEmployeeSkill[];
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  already_assigned: boolean;
  suggested_role: string | null;
}

export interface ProjectRequiredSkill {
  id: string;
  project_id: string;
  skill_id: string;
  skill_name: string;
  skill_category: string;
  min_level: number;
  min_level_label: string;
  created_at: string;
}

export interface SkillCoverage {
  skill_id: string;
  skill_name: string;
  skill_category: string;
  min_level: number;
  min_level_label: string;
  coverage_status: 'covered' | 'partial' | 'missing';
  covered_by_names: string[];
}

export interface EmployeeInternalCost {
  id: string;
  employee_id: string;
  cost_type: string;
  internal_hourly: number | null;
  monthly_salary: number | null;
  currency: string;
  reference_billing_rate: number | null;
  effective_from: string | null;
  effective_to: string | null;
  internal_notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceTimeEntry {
  id: string;
  invoice_id: string;
  time_entry_id: string;
  created_at: string;
}
