/* eslint-disable no-console */
import { PrismaClient, AccountType, AccountSubtype, DocType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ---------------------------------------------------------------- permissions
// Codes mirror exactly what @RequirePermissions() decorators use in controllers
// and what useCan() checks in the admin sidebar.
const PERMISSION_GROUPS: Record<string, string[]> = {
  dashboard: ['view'],
  // CRM
  'crm.leads':          ['read', 'create', 'update', 'delete', 'convert'],
  'crm.customers':      ['read', 'create', 'update', 'delete'],
  'crm.follow_ups':     ['read', 'create', 'update', 'delete'],
  'crm.communications': ['create'],
  // Sales
  quotations: ['read', 'create', 'update', 'delete', 'send', 'approve', 'convert'],
  orders:     ['read', 'create', 'update', 'delete', 'change_status', 'cancel'],
  // Production  (production.read used by sidebar; sub-resource codes by controllers)
  production:               ['read', 'view'],
  'production.jobs':        ['read', 'create', 'update'],
  'production.stages':      ['update'],
  'production.allocations': ['write'],
  // Inventory
  inventory: ['read', 'write', 'view', 'adjust', 'issue'],
  // Procurement  (procurement.read used by sidebar; sub-resource codes by controllers)
  procurement:              ['read', 'view'],
  'procurement.suppliers':  ['read', 'write'],
  'procurement.pos':        ['read', 'write'],
  'procurement.grns':       ['read', 'write'],
  'procurement.bills':      ['read', 'write'],
  'procurement.payments':   ['read', 'write'],
  // Finance / Accounting  (finance.read used by sidebar & reporting)
  finance:             ['read'],
  'finance.accounts':  ['write'],
  'finance.journal':   ['write'],
  'finance.invoices':  ['read', 'write', 'post'],
  'finance.payments':  ['read', 'write'],
  'finance.expenses':  ['write'],
  'finance.payroll':   ['write'],
  'finance.periods':   ['write'],
  payments: ['create'],
  // Reports
  reports: ['read', 'view', 'financial'],
  // Supporting
  documents:     ['view', 'generate'],
  whatsapp:      ['read', 'send'],
  notifications: ['view'],
  users:         ['view', 'create', 'update', 'delete', 'manage_roles'],
  settings:      ['view', 'read', 'update', 'write'],
  audit:         ['view', 'read'],
};

const ALL_PERMS = Object.entries(PERMISSION_GROUPS).flatMap(([group, actions]) =>
  actions.map((a) => ({
    code: `${group}.${a}`,
    group: group.split('.')[0],
    name: `${group} ${a}`.replace(/[._]/g, ' '),
  })),
);

const perms = (...patterns: string[]): string[] => {
  const out = new Set<string>();
  for (const p of patterns) {
    if (p.endsWith('.*')) {
      const group = p.slice(0, -2);
      for (const a of PERMISSION_GROUPS[group] ?? []) out.add(`${group}.${a}`);
    } else {
      out.add(p);
    }
  }
  return [...out];
};

const ROLE_DEFS: Record<string, string[]> = {
  'Super Admin': ALL_PERMS.map((p) => p.code),

  Director: perms(
    'dashboard.view',
    'crm.leads.*', 'crm.customers.*',
    'quotations.read', 'quotations.approve',
    'orders.read',
    'production.read', 'production.jobs.read',
    'inventory.read', 'inventory.view',
    'procurement.read', 'procurement.view',
    'procurement.suppliers.read', 'procurement.pos.read', 'procurement.grns.read',
    'procurement.bills.read', 'procurement.payments.read',
    'finance.read', 'finance.invoices.read', 'finance.payments.read',
    'reports.*',
    'documents.view', 'documents.generate',
    'whatsapp.read', 'notifications.view',
    'users.view', 'settings.*', 'audit.*',
  ),

  'Operations Manager': perms(
    'dashboard.view',
    'crm.leads.*', 'crm.customers.*', 'crm.follow_ups.*', 'crm.communications.create',
    'quotations.*', 'orders.*',
    'production.*', 'production.jobs.*', 'production.stages.update', 'production.allocations.write',
    'inventory.*',
    'procurement.*', 'procurement.suppliers.*', 'procurement.pos.*',
    'procurement.grns.*', 'procurement.bills.*', 'procurement.payments.*',
    'documents.*', 'whatsapp.*', 'notifications.view', 'reports.read', 'reports.view',
  ),

  'Production Manager': perms(
    'dashboard.view',
    'orders.read',
    'production.*', 'production.jobs.*', 'production.stages.update', 'production.allocations.write',
    'inventory.read', 'inventory.view', 'inventory.issue',
    'documents.view', 'notifications.view', 'reports.read', 'reports.view',
  ),

  'Production Staff': perms(
    'dashboard.view',
    'production.read', 'production.view',
    'production.jobs.read', 'production.jobs.update',
    'production.stages.update',
    'notifications.view',
  ),

  'Sales Representative': perms(
    'dashboard.view',
    'crm.leads.*', 'crm.customers.read', 'crm.customers.create', 'crm.customers.update',
    'crm.follow_ups.*', 'crm.communications.create',
    'quotations.read', 'quotations.create', 'quotations.update', 'quotations.send', 'quotations.convert',
    'orders.read', 'orders.create',
    'documents.*', 'whatsapp.*', 'notifications.view',
  ),

  'Finance Officer': perms(
    'dashboard.view',
    'crm.customers.read',
    'orders.read',
    'finance.*', 'finance.accounts.write', 'finance.journal.write',
    'finance.invoices.*', 'finance.payments.*', 'finance.expenses.write',
    'finance.payroll.write', 'finance.periods.write',
    'payments.create',
    'reports.*',
    'documents.*',
    'procurement.read', 'procurement.bills.read', 'procurement.payments.read',
    'notifications.view',
  ),

  'Inventory Officer': perms(
    'dashboard.view',
    'inventory.*',
    'procurement.read', 'procurement.view',
    'procurement.suppliers.*', 'procurement.pos.*', 'procurement.grns.*',
    'production.read', 'production.jobs.read',
    'documents.view', 'notifications.view',
  ),

  Auditor: perms(
    'dashboard.view',
    'crm.leads.read', 'crm.customers.read',
    'quotations.read', 'orders.read',
    'production.read', 'production.jobs.read',
    'inventory.read', 'inventory.view',
    'procurement.read', 'procurement.suppliers.read',
    'finance.read', 'finance.invoices.read', 'finance.payments.read',
    'reports.*',
    'documents.view',
    'users.view', 'settings.read', 'settings.view',
    'audit.*',
  ),

  Customer: [], // portal principals — no staff RBAC
};

// ---------------------------------------------------------- chart of accounts
type CoARow = [code: string, name: string, type: AccountType, subtype: AccountSubtype, system?: boolean];

const COA: CoARow[] = [
  // Assets
  ['1000', 'Cash on Hand', 'ASSET', 'CASH', true],
  ['1010', 'Bank Account (USD)', 'ASSET', 'BANK', true],
  ['1020', 'EcoCash / Mobile Wallet', 'ASSET', 'MOBILE_WALLET', true],
  ['1100', 'Accounts Receivable', 'ASSET', 'ACCOUNTS_RECEIVABLE', true],
  ['1300', 'Raw Materials Inventory', 'ASSET', 'INVENTORY_RAW', true],
  ['1310', 'Work In Progress', 'ASSET', 'WIP', true],
  ['1320', 'Finished Goods', 'ASSET', 'FINISHED_GOODS', true],
  ['1500', 'Equipment & Machinery', 'ASSET', 'FIXED_ASSET'],
  ['1510', 'Accumulated Depreciation', 'ASSET', 'ACCUMULATED_DEPRECIATION'],
  // Liabilities
  ['2100', 'Goods Received Not Invoiced', 'LIABILITY', 'GRNI', true],
  ['2110', 'Accounts Payable', 'LIABILITY', 'ACCOUNTS_PAYABLE', true],
  ['2300', 'Customer Deposits', 'LIABILITY', 'CUSTOMER_DEPOSITS', true],
  ['2200', 'VAT Payable', 'LIABILITY', 'VAT_PAYABLE', true],
  ['2400', 'Loans Payable', 'LIABILITY', 'LOAN'],
  ['2500', 'Payroll Liabilities', 'LIABILITY', 'PAYROLL_LIABILITY', true],
  // Equity
  ['3000', 'Owner Capital', 'EQUITY', 'CAPITAL', true],
  ['3100', 'Owner Drawings', 'EQUITY', 'DRAWINGS', true],
  ['3900', 'Retained Earnings', 'EQUITY', 'RETAINED_EARNINGS', true],
  // Revenue
  ['4000', 'Rug Sales Revenue', 'REVENUE', 'SALES_REVENUE', true],
  ['4900', 'Other Income', 'REVENUE', 'OTHER_INCOME'],
  // Expenses
  ['5000', 'Cost of Goods Sold', 'EXPENSE', 'COGS', true],
  ['5100', 'Labour Absorbed (Contra)', 'EXPENSE', 'LABOUR_ABSORBED', true],
  ['5200', 'Overhead Absorbed (Contra)', 'EXPENSE', 'OVERHEAD_ABSORBED', true],
  ['5300', 'Production Waste', 'EXPENSE', 'PRODUCTION_WASTE', true],
  ['6100', 'Salaries & Wages', 'EXPENSE', 'PAYROLL_EXPENSE', true],
  ['6200', 'Rent Expense', 'EXPENSE', 'RENT_EXPENSE'],
  ['6300', 'Utilities Expense', 'EXPENSE', 'UTILITIES_EXPENSE'],
  ['6400', 'Marketing & Advertising', 'EXPENSE', 'MARKETING_EXPENSE'],
  ['6500', 'Delivery & Transport', 'EXPENSE', 'DELIVERY_EXPENSE'],
  ['6600', 'Depreciation Expense', 'EXPENSE', 'DEPRECIATION_EXPENSE'],
  ['6700', 'Bank Charges', 'EXPENSE', 'BANK_CHARGES'],
  ['6900', 'General Expenses', 'EXPENSE', 'GENERAL_EXPENSE', true],
];

// ------------------------------------------------------------- stages & misc
const STAGES: Array<[number, string, string, boolean?]> = [
  [1, 'MATERIAL_ALLOCATION', 'Material Allocation'],
  [2, 'FRAME_PREPARATION', 'Frame Preparation'],
  [3, 'DESIGN_TRANSFER', 'Design Transfer'],
  [4, 'TUFTING', 'Tufting'],
  [5, 'GLUE_APPLICATION', 'Glue Application'],
  [6, 'DRYING', 'Drying'],
  [7, 'BACKING_INSTALLATION', 'Backing Installation'],
  [8, 'BINDING', 'Binding'],
  [9, 'TRIMMING', 'Trimming'],
  [10, 'CARVING', 'Carving'],
  [11, 'QUALITY_INSPECTION', 'Quality Inspection', true],
  [12, 'PACKAGING', 'Packaging'],
  [13, 'READY_FOR_COLLECTION', 'Ready For Collection'],
];

const MATERIAL_CATEGORIES = ['Yarn', 'Monks Cloth', 'Backing Cloth', 'Glue', 'Binding Tape', 'Packaging Materials'];

const SEQUENCES: Array<[DocType, string]> = [
  ['QUOTATION', 'QT'], ['ORDER', 'SO'], ['INVOICE', 'INV'], ['CREDIT_NOTE', 'CN'],
  ['RECEIPT', 'RCT'], ['DELIVERY_NOTE', 'DN'], ['JOB_CARD', 'JC'], ['PURCHASE_ORDER', 'PO'],
  ['GRN', 'GRN'], ['SUPPLIER_INVOICE', 'BILL'], ['SUPPLIER_PAYMENT', 'SP'],
  ['CUSTOMER_STATEMENT', 'STMT'], ['JOURNAL', 'JE'], ['PAYMENT', 'PAY'], ['EXPENSE', 'EXP'],
  ['CUSTOMER', 'CUST'], ['SUPPLIER', 'SUPP'], ['LEAD', 'LEAD'], ['JOB', 'JOB'],
  ['MATERIAL', 'MAT'], ['ADJUSTMENT', 'ADJ'],
];

async function main() {
  console.log('Seeding Stitch\'t ERP...');

  // --- Company + branch + warehouse
  let company = await prisma.company.findFirst({ where: { name: "Stitch't" } });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: "Stitch't",
        legalName: "Stitch't Ltd",
        address: 'Harare, Zimbabwe',
        city: 'Harare',
        country: 'Zimbabwe',
        phone: '+263 788 959 677',
        whatsapp: '+263 788 959 677',
        email: 'stichiitt@gmail.com',
        baseCurrency: 'USD',
      },
    });
  }
  const companyId = company.id;

  const branch = await prisma.branch.findFirst({ where: { companyId, isDefault: true } });
  if (!branch) {
    await prisma.branch.create({ data: { companyId, name: 'Main Branch', isDefault: true } });
  }

  const warehouse = await prisma.warehouse.findFirst({ where: { companyId, isDefault: true } });
  if (!warehouse) {
    await prisma.warehouse.create({ data: { companyId, name: 'Main Warehouse', isDefault: true } });
  }

  // --- Permissions
  for (const p of ALL_PERMS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { group: p.group, name: p.name },
      create: p,
    });
  }
  const permissionRows = await prisma.permission.findMany();
  const permByCode = new Map(permissionRows.map((p) => [p.code, p.id]));

  // --- Roles
  for (const [name, codes] of Object.entries(ROLE_DEFS)) {
    const role = await prisma.role.upsert({
      where: { companyId_name: { companyId, name } },
      update: {},
      create: { companyId, name, isSystem: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: codes
        .map((code) => permByCode.get(code))
        .filter((id): id is string => Boolean(id))
        .map((permissionId) => ({ roleId: role.id, permissionId })),
      skipDuplicates: true,
    });
  }

  // --- Super admin user
  const adminEmail = 'admin@stitchit.co.zw';
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        companyId,
        email: adminEmail,
        passwordHash: await bcrypt.hash('Admin@1234', 10),
        firstName: 'System',
        lastName: 'Administrator',
      },
    });
    const superAdmin = await prisma.role.findFirstOrThrow({ where: { companyId, name: 'Super Admin' } });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: superAdmin.id } });
    console.log(`Created super admin: ${adminEmail} / Admin@1234 (change immediately)`);
  }

  // --- Chart of accounts
  for (const [code, name, type, subtype, isSystem] of COA) {
    await prisma.account.upsert({
      where: { companyId_code: { companyId, code } },
      update: { name, type, subtype },
      create: { companyId, code, name, type, subtype, isSystem: Boolean(isSystem) },
    });
  }

  // --- Production stage definitions
  for (const [sequence, code, name, isQualityGate] of STAGES) {
    await prisma.productionStageDef.upsert({
      where: { companyId_code: { companyId, code } },
      update: { sequence, name, isQualityGate: Boolean(isQualityGate) },
      create: { companyId, sequence, code, name, isQualityGate: Boolean(isQualityGate) },
    });
  }

  // --- Material categories
  for (const name of MATERIAL_CATEGORIES) {
    await prisma.materialCategory.upsert({
      where: { companyId_name: { companyId, name } },
      update: {},
      create: { companyId, name },
    });
  }

  // --- Number sequences
  for (const [docType, prefix] of SEQUENCES) {
    await prisma.numberSequence.upsert({
      where: { companyId_docType: { companyId, docType } },
      update: {},
      create: { companyId, docType, prefix, yearlyReset: true, currentYear: new Date().getFullYear() },
    });
  }

  // --- Pricing parameters (inputs to the costing/pricing engine; AI-ready factors)
  const pricingDefaults = {
    pricePerSqCm: 0.012,
    minimumPrice: 40,
    complexityFactors: { SIMPLE: 1.0, MEDIUM: 1.2, COMPLEX: 1.5, VERY_COMPLEX: 2.0 },
    shapeFactors: { RECTANGLE: 1.0, SQUARE: 1.0, CIRCLE: 1.15, OVAL: 1.2, RUNNER: 1.05, IRREGULAR: 1.35, CUSTOM: 1.4 },
    rushFactor: 1.25,
    desiredMarginPct: 45,
    currency: 'USD',
  };
  await prisma.systemSetting.upsert({
    where: { companyId_key: { companyId, key: 'pricing' } },
    update: {},
    create: { companyId, key: 'pricing', value: pricingDefaults },
  });

  // --- Labour & overhead rates
  const labourRate = await prisma.labourRate.findFirst({ where: { companyId, stageDefId: null } });
  if (!labourRate) {
    await prisma.labourRate.create({ data: { companyId, ratePerHour: 3.5 } });
  }
  const overheadRate = await prisma.overheadRate.findFirst({ where: { companyId } });
  if (!overheadRate) {
    await prisma.overheadRate.create({ data: { companyId, basis: 'LABOUR_HOURS', rate: 2.0 } });
  }

  // --- Current fiscal period
  const now = new Date();
  await prisma.fiscalPeriod.upsert({
    where: { companyId_year_month: { companyId, year: now.getFullYear(), month: now.getMonth() + 1 } },
    update: {},
    create: { companyId, year: now.getFullYear(), month: now.getMonth() + 1 },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
