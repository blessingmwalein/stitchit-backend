import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountsService } from './accounts.service';
import { JournalService, JournalLineInput } from './journal.service';
import Decimal from 'decimal.js';

type Method = string; // PaymentMethod enum values
type Tx = Prisma.TransactionClient | undefined;

function cashSubtype(method: Method): 'CASH' | 'BANK' | 'MOBILE_WALLET' {
  if (method === 'CASH') return 'CASH';
  if (method === 'MOBILE_MONEY') return 'MOBILE_WALLET';
  return 'BANK'; // BANK_TRANSFER | PAYNOW | STRIPE
}

@Injectable()
export class PostingService {
  constructor(
    private readonly accounts: AccountsService,
    private readonly journal: JournalService,
  ) {}

  /** Invoice posted: Dr AR / Cr Sales Revenue [+ Cr VAT Payable] */
  async postInvoice(opts: {
    companyId: string;
    invoiceId: string;
    customerId: string;
    orderId?: string;
    subtotal: Decimal;
    taxTotal: Decimal;
    total: Decimal;
    date?: Date;
    userId?: string;
    tx?: Tx;
  }) {
    const accts = await this.accounts.bySubtypes(opts.companyId, [
      'ACCOUNTS_RECEIVABLE', 'SALES_REVENUE', 'VAT_PAYABLE',
    ]);
    const ar = accts.get('ACCOUNTS_RECEIVABLE')!;
    const rev = accts.get('SALES_REVENUE')!;
    const vat = accts.get('VAT_PAYABLE')!;

    const lines: JournalLineInput[] = [
      { accountId: ar.id, debit: opts.total, customerId: opts.customerId, orderId: opts.orderId },
      { accountId: rev.id, credit: opts.subtotal },
    ];
    if (opts.taxTotal.gt(0)) {
      lines.push({ accountId: vat.id, credit: opts.taxTotal });
    }

    return this.journal.createAndPost({
      companyId: opts.companyId,
      sourceType: 'INVOICE',
      sourceId: opts.invoiceId,
      memo: 'Invoice posted',
      entryDate: opts.date,
      lines,
      postedByUserId: opts.userId,
      tx: opts.tx,
    });
  }

  /** Customer deposit received: Dr Cash/Bank / Cr Customer Deposits */
  async postDeposit(opts: {
    companyId: string;
    paymentId: string;
    customerId: string;
    orderId?: string;
    amount: Decimal;
    method: Method;
    date?: Date;
    userId?: string;
    tx?: Tx;
  }) {
    const sub = cashSubtype(opts.method);
    const accts = await this.accounts.bySubtypes(opts.companyId, [sub, 'CUSTOMER_DEPOSITS']);
    const cash = accts.get(sub)!;
    const deposits = accts.get('CUSTOMER_DEPOSITS')!;

    return this.journal.createAndPost({
      companyId: opts.companyId,
      sourceType: 'DEPOSIT',
      sourceId: opts.paymentId,
      memo: 'Customer deposit received',
      entryDate: opts.date,
      lines: [
        { accountId: cash.id, debit: opts.amount },
        { accountId: deposits.id, credit: opts.amount, customerId: opts.customerId, orderId: opts.orderId },
      ],
      postedByUserId: opts.userId,
      tx: opts.tx,
    });
  }

  /** Deposit applied to invoice: Dr Customer Deposits / Cr AR */
  async postDepositApplication(opts: {
    companyId: string;
    allocationId: string;
    customerId: string;
    orderId?: string;
    amount: Decimal;
    date?: Date;
    userId?: string;
    tx?: Tx;
  }) {
    const accts = await this.accounts.bySubtypes(opts.companyId, [
      'CUSTOMER_DEPOSITS', 'ACCOUNTS_RECEIVABLE',
    ]);
    const deposits = accts.get('CUSTOMER_DEPOSITS')!;
    const ar = accts.get('ACCOUNTS_RECEIVABLE')!;

    return this.journal.createAndPost({
      companyId: opts.companyId,
      sourceType: 'DEPOSIT_APPLICATION',
      sourceId: opts.allocationId,
      memo: 'Deposit applied to invoice',
      entryDate: opts.date,
      lines: [
        { accountId: deposits.id, debit: opts.amount, customerId: opts.customerId },
        { accountId: ar.id, credit: opts.amount, customerId: opts.customerId, orderId: opts.orderId },
      ],
      postedByUserId: opts.userId,
      tx: opts.tx,
    });
  }

  /** Direct payment: Dr Cash/Bank / Cr AR */
  async postPayment(opts: {
    companyId: string;
    paymentId: string;
    customerId: string;
    orderId?: string;
    amount: Decimal;
    method: Method;
    date?: Date;
    userId?: string;
    tx?: Tx;
  }) {
    const sub = cashSubtype(opts.method);
    const accts = await this.accounts.bySubtypes(opts.companyId, [sub, 'ACCOUNTS_RECEIVABLE']);
    const cash = accts.get(sub)!;
    const ar = accts.get('ACCOUNTS_RECEIVABLE')!;

    return this.journal.createAndPost({
      companyId: opts.companyId,
      sourceType: 'PAYMENT',
      sourceId: opts.paymentId,
      memo: 'Customer payment received',
      entryDate: opts.date,
      lines: [
        { accountId: cash.id, debit: opts.amount },
        { accountId: ar.id, credit: opts.amount, customerId: opts.customerId, orderId: opts.orderId },
      ],
      postedByUserId: opts.userId,
      tx: opts.tx,
    });
  }

  /** GRN: Dr Raw Materials / Cr GRNI */
  async postGrn(opts: {
    companyId: string;
    grnId: string;
    supplierId: string;
    amount: Decimal;
    date?: Date;
    userId?: string;
    tx?: Tx;
  }) {
    const accts = await this.accounts.bySubtypes(opts.companyId, ['INVENTORY_RAW', 'GRNI']);
    const rawMat = accts.get('INVENTORY_RAW')!;
    const grni = accts.get('GRNI')!;

    return this.journal.createAndPost({
      companyId: opts.companyId,
      sourceType: 'GRN',
      sourceId: opts.grnId,
      memo: 'Goods received note',
      entryDate: opts.date,
      lines: [
        { accountId: rawMat.id, debit: opts.amount },
        { accountId: grni.id, credit: opts.amount, supplierId: opts.supplierId },
      ],
      postedByUserId: opts.userId,
      tx: opts.tx,
    });
  }

  /** Supplier bill matched: Dr GRNI / Cr AP */
  async postSupplierBill(opts: {
    companyId: string;
    supplierInvoiceId: string;
    supplierId: string;
    amount: Decimal;
    date?: Date;
    userId?: string;
    tx?: Tx;
  }) {
    const accts = await this.accounts.bySubtypes(opts.companyId, ['GRNI', 'ACCOUNTS_PAYABLE']);
    const grni = accts.get('GRNI')!;
    const ap = accts.get('ACCOUNTS_PAYABLE')!;

    return this.journal.createAndPost({
      companyId: opts.companyId,
      sourceType: 'SUPPLIER_INVOICE',
      sourceId: opts.supplierInvoiceId,
      memo: 'Supplier invoice',
      entryDate: opts.date,
      lines: [
        { accountId: grni.id, debit: opts.amount, supplierId: opts.supplierId },
        { accountId: ap.id, credit: opts.amount, supplierId: opts.supplierId },
      ],
      postedByUserId: opts.userId,
      tx: opts.tx,
    });
  }

  /** Supplier payment: Dr AP / Cr Cash/Bank */
  async postSupplierPayment(opts: {
    companyId: string;
    supplierPaymentId: string;
    supplierId: string;
    amount: Decimal;
    method: Method;
    date?: Date;
    userId?: string;
    tx?: Tx;
  }) {
    const sub = cashSubtype(opts.method);
    const accts = await this.accounts.bySubtypes(opts.companyId, ['ACCOUNTS_PAYABLE', sub]);
    const ap = accts.get('ACCOUNTS_PAYABLE')!;
    const cash = accts.get(sub)!;

    return this.journal.createAndPost({
      companyId: opts.companyId,
      sourceType: 'SUPPLIER_PAYMENT',
      sourceId: opts.supplierPaymentId,
      memo: 'Supplier payment',
      entryDate: opts.date,
      lines: [
        { accountId: ap.id, debit: opts.amount, supplierId: opts.supplierId },
        { accountId: cash.id, credit: opts.amount },
      ],
      postedByUserId: opts.userId,
      tx: opts.tx,
    });
  }

  /** Material issue to production: Dr WIP / Cr Raw Materials (at avgCost) */
  async postMaterialIssue(opts: {
    companyId: string;
    movementId: string;
    productionJobId?: string;
    orderId?: string;
    amount: Decimal;
    date?: Date;
    userId?: string;
    tx?: Tx;
  }) {
    const accts = await this.accounts.bySubtypes(opts.companyId, ['WIP', 'INVENTORY_RAW']);
    const wip = accts.get('WIP')!;
    const rawMat = accts.get('INVENTORY_RAW')!;

    return this.journal.createAndPost({
      companyId: opts.companyId,
      sourceType: 'MATERIAL_ISSUE',
      sourceId: opts.movementId,
      memo: 'Material issue to production',
      entryDate: opts.date,
      lines: [
        { accountId: wip.id, debit: opts.amount, productionJobId: opts.productionJobId, orderId: opts.orderId },
        { accountId: rawMat.id, credit: opts.amount },
      ],
      postedByUserId: opts.userId,
      tx: opts.tx,
    });
  }

  /** Production waste: Dr Waste Expense / Cr WIP */
  async postWaste(opts: {
    companyId: string;
    movementId: string;
    productionJobId?: string;
    amount: Decimal;
    date?: Date;
    userId?: string;
    tx?: Tx;
  }) {
    const accts = await this.accounts.bySubtypes(opts.companyId, ['PRODUCTION_WASTE', 'WIP']);
    const waste = accts.get('PRODUCTION_WASTE')!;
    const wip = accts.get('WIP')!;

    return this.journal.createAndPost({
      companyId: opts.companyId,
      sourceType: 'WASTE',
      sourceId: opts.movementId,
      memo: 'Production waste',
      entryDate: opts.date,
      lines: [
        { accountId: waste.id, debit: opts.amount, productionJobId: opts.productionJobId },
        { accountId: wip.id, credit: opts.amount, productionJobId: opts.productionJobId },
      ],
      postedByUserId: opts.userId,
      tx: opts.tx,
    });
  }

  /** Labour/OH absorption: Dr WIP / Cr Labour Absorbed + OH Absorbed */
  async postLabourAbsorption(opts: {
    companyId: string;
    stageId: string;
    productionJobId?: string;
    orderId?: string;
    labourAmount: Decimal;
    ohAmount: Decimal;
    date?: Date;
    userId?: string;
    tx?: Tx;
  }) {
    const total = opts.labourAmount.plus(opts.ohAmount);
    if (total.isZero()) return null;

    const accts = await this.accounts.bySubtypes(opts.companyId, [
      'WIP', 'LABOUR_ABSORBED', 'OVERHEAD_ABSORBED',
    ]);
    const wip = accts.get('WIP')!;
    const labour = accts.get('LABOUR_ABSORBED')!;
    const oh = accts.get('OVERHEAD_ABSORBED')!;

    const lines: JournalLineInput[] = [
      { accountId: wip.id, debit: total, productionJobId: opts.productionJobId, orderId: opts.orderId },
    ];
    if (opts.labourAmount.gt(0)) lines.push({ accountId: labour.id, credit: opts.labourAmount });
    if (opts.ohAmount.gt(0)) lines.push({ accountId: oh.id, credit: opts.ohAmount });

    return this.journal.createAndPost({
      companyId: opts.companyId,
      sourceType: 'LABOUR_ABSORPTION',
      sourceId: opts.stageId,
      memo: 'Labour/overhead absorbed into WIP',
      entryDate: opts.date,
      lines,
      postedByUserId: opts.userId,
      tx: opts.tx,
    });
  }

  /** Job completed (make-to-order): Dr COGS / Cr WIP */
  async postJobCompletion(opts: {
    companyId: string;
    jobId: string;
    orderId?: string;
    amount: Decimal;
    date?: Date;
    userId?: string;
    tx?: Tx;
  }) {
    if (opts.amount.isZero()) return null;
    const accts = await this.accounts.bySubtypes(opts.companyId, ['COGS', 'WIP']);
    const cogs = accts.get('COGS')!;
    const wip = accts.get('WIP')!;

    return this.journal.createAndPost({
      companyId: opts.companyId,
      sourceType: 'JOB_COMPLETION',
      sourceId: opts.jobId,
      memo: 'Job completed — WIP transferred to COGS',
      entryDate: opts.date,
      lines: [
        { accountId: cogs.id, debit: opts.amount, productionJobId: opts.jobId, orderId: opts.orderId },
        { accountId: wip.id, credit: opts.amount, productionJobId: opts.jobId },
      ],
      postedByUserId: opts.userId,
      tx: opts.tx,
    });
  }

  /** Expense entry: Dr Expense Account / Cr Cash/Bank account */
  async postExpense(opts: {
    companyId: string;
    expenseId: string;
    expenseAccountId: string;
    paidFromAccountId: string;
    amount: Decimal;
    date?: Date;
    userId?: string;
    memo?: string;
    tx?: Tx;
  }) {
    return this.journal.createAndPost({
      companyId: opts.companyId,
      sourceType: 'EXPENSE',
      sourceId: opts.expenseId,
      memo: opts.memo ?? 'Expense recorded',
      entryDate: opts.date,
      lines: [
        { accountId: opts.expenseAccountId, debit: opts.amount },
        { accountId: opts.paidFromAccountId, credit: opts.amount },
      ],
      postedByUserId: opts.userId,
      tx: opts.tx,
    });
  }

  /** Payroll run: Dr Payroll Expense / Cr Payroll Liability */
  async postPayroll(opts: {
    companyId: string;
    payrollRunId: string;
    gross: Decimal;
    deductions: Decimal;
    net: Decimal;
    date?: Date;
    userId?: string;
    tx?: Tx;
  }) {
    const accts = await this.accounts.bySubtypes(opts.companyId, [
      'PAYROLL_EXPENSE', 'PAYROLL_LIABILITY',
    ]);
    const expense = accts.get('PAYROLL_EXPENSE')!;
    const liability = accts.get('PAYROLL_LIABILITY')!;

    return this.journal.createAndPost({
      companyId: opts.companyId,
      sourceType: 'PAYROLL',
      sourceId: opts.payrollRunId,
      memo: 'Payroll run',
      entryDate: opts.date,
      lines: [
        { accountId: expense.id, debit: opts.gross },
        { accountId: liability.id, credit: opts.gross },
      ],
      postedByUserId: opts.userId,
      tx: opts.tx,
    });
  }
}
