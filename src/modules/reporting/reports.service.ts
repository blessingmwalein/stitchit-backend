import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import Decimal from 'decimal.js';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Trial Balance ─────────────────────────────────────────────────────────

  async trialBalance(companyId: string, fromDate: Date, toDate: Date) {
    const totals = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          companyId,
          status: 'POSTED',
          entryDate: { gte: fromDate, lte: toDate },
        },
      },
      _sum: { debit: true, credit: true },
    });

    if (!totals.length) return { rows: [], totalDebit: '0', totalCredit: '0' };

    const accountIds = totals.map((t) => t.accountId);
    const accounts = await this.prisma.account.findMany({
      where: { companyId, id: { in: accountIds } },
      orderBy: { code: 'asc' },
    });

    const sumMap = new Map(totals.map((t) => [t.accountId, t._sum]));
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);

    const rows = accounts.map((acc) => {
      const sums = sumMap.get(acc.id);
      const dr = new Decimal(sums?.debit?.toString() ?? '0');
      const cr = new Decimal(sums?.credit?.toString() ?? '0');
      totalDebit = totalDebit.plus(dr);
      totalCredit = totalCredit.plus(cr);
      return {
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        subtype: acc.subtype,
        debit: dr.toFixed(4),
        credit: cr.toFixed(4),
        balance: dr.minus(cr).toFixed(4),
      };
    });

    return {
      rows,
      totalDebit: totalDebit.toFixed(4),
      totalCredit: totalCredit.toFixed(4),
    };
  }

  // ── General Ledger ────────────────────────────────────────────────────────

  async generalLedger(companyId: string, accountId: string, fromDate: Date, toDate: Date) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, companyId },
    });

    // Opening balance: sum all posted lines before fromDate
    const opening = await this.prisma.journalLine.aggregate({
      where: {
        accountId,
        journalEntry: { companyId, status: 'POSTED', entryDate: { lt: fromDate } },
      },
      _sum: { debit: true, credit: true },
    });
    const openingBalance = new Decimal(opening._sum.debit?.toString() ?? '0')
      .minus(new Decimal(opening._sum.credit?.toString() ?? '0'));

    // Lines in date range
    const lines = await this.prisma.journalLine.findMany({
      where: {
        accountId,
        journalEntry: { companyId, status: 'POSTED', entryDate: { gte: fromDate, lte: toDate } },
      },
      include: {
        journalEntry: {
          select: { entryNumber: true, entryDate: true, memo: true, sourceType: true },
        },
      },
      orderBy: [{ journalEntry: { entryDate: 'asc' } }, { lineNo: 'asc' }],
    });

    let running = openingBalance;
    const rows = lines.map((l) => {
      const dr = new Decimal(l.debit.toString());
      const cr = new Decimal(l.credit.toString());
      running = running.plus(dr).minus(cr);
      return {
        entryNumber: l.journalEntry.entryNumber,
        entryDate: l.journalEntry.entryDate,
        memo: l.journalEntry.memo,
        sourceType: l.journalEntry.sourceType,
        description: l.description,
        debit: dr.toFixed(4),
        credit: cr.toFixed(4),
        balance: running.toFixed(4),
      };
    });

    return { account, openingBalance: openingBalance.toFixed(4), rows };
  }

  // ── Income Statement ──────────────────────────────────────────────────────

  async incomeStatement(companyId: string, fromDate: Date, toDate: Date) {
    const totals = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          companyId,
          status: 'POSTED',
          entryDate: { gte: fromDate, lte: toDate },
        },
        account: { type: { in: ['REVENUE', 'EXPENSE'] } },
      },
      _sum: { debit: true, credit: true },
    });

    const accountIds = totals.map((t) => t.accountId);
    const accounts = await this.prisma.account.findMany({
      where: { companyId, id: { in: accountIds } },
      orderBy: { code: 'asc' },
    });

    const sumMap = new Map(totals.map((t) => [t.accountId, t._sum]));

    const revenue: any[] = [];
    const expenses: any[] = [];
    let totalRevenue = new Decimal(0);
    let totalExpenses = new Decimal(0);

    for (const acc of accounts) {
      const sums = sumMap.get(acc.id);
      const dr = new Decimal(sums?.debit?.toString() ?? '0');
      const cr = new Decimal(sums?.credit?.toString() ?? '0');
      if (acc.type === 'REVENUE') {
        const balance = cr.minus(dr); // credit-normal
        totalRevenue = totalRevenue.plus(balance);
        revenue.push({ code: acc.code, name: acc.name, subtype: acc.subtype, amount: balance.toFixed(4) });
      } else {
        const balance = dr.minus(cr); // debit-normal
        totalExpenses = totalExpenses.plus(balance);
        expenses.push({ code: acc.code, name: acc.name, subtype: acc.subtype, amount: balance.toFixed(4) });
      }
    }

    const netIncome = totalRevenue.minus(totalExpenses);
    return {
      revenue,
      expenses,
      totalRevenue: totalRevenue.toFixed(4),
      totalExpenses: totalExpenses.toFixed(4),
      netIncome: netIncome.toFixed(4),
      fromDate,
      toDate,
    };
  }

  // ── Balance Sheet ─────────────────────────────────────────────────────────

  async balanceSheet(companyId: string, asOf: Date) {
    const totals = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          companyId,
          status: 'POSTED',
          entryDate: { lte: asOf },
        },
        account: { type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] } },
      },
      _sum: { debit: true, credit: true },
    });

    const accountIds = totals.map((t) => t.accountId);
    const accounts = await this.prisma.account.findMany({
      where: { companyId, id: { in: accountIds } },
      orderBy: { code: 'asc' },
    });

    const sumMap = new Map(totals.map((t) => [t.accountId, t._sum]));
    const assets: any[] = [];
    const liabilities: any[] = [];
    const equity: any[] = [];
    let totalAssets = new Decimal(0);
    let totalLiabilities = new Decimal(0);
    let totalEquity = new Decimal(0);

    for (const acc of accounts) {
      const sums = sumMap.get(acc.id);
      const dr = new Decimal(sums?.debit?.toString() ?? '0');
      const cr = new Decimal(sums?.credit?.toString() ?? '0');
      const row = { code: acc.code, name: acc.name, subtype: acc.subtype, balance: '' };

      if (acc.type === 'ASSET') {
        const bal = dr.minus(cr);
        totalAssets = totalAssets.plus(bal);
        assets.push({ ...row, balance: bal.toFixed(4) });
      } else if (acc.type === 'LIABILITY') {
        const bal = cr.minus(dr);
        totalLiabilities = totalLiabilities.plus(bal);
        liabilities.push({ ...row, balance: bal.toFixed(4) });
      } else {
        const bal = cr.minus(dr);
        totalEquity = totalEquity.plus(bal);
        equity.push({ ...row, balance: bal.toFixed(4) });
      }
    }

    return {
      assets,
      liabilities,
      equity,
      totalAssets: totalAssets.toFixed(4),
      totalLiabilities: totalLiabilities.toFixed(4),
      totalEquity: totalEquity.toFixed(4),
      balanced: totalAssets.minus(totalLiabilities.plus(totalEquity)).abs().lt('0.01'),
      asOf,
    };
  }

  // ── AR Aging ──────────────────────────────────────────────────────────────

  async arAging(companyId: string, asOf: Date) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        companyId,
        status: { in: ['POSTED', 'PARTIALLY_PAID', 'OVERDUE'] },
        deletedAt: null,
      },
      include: {
        customer: {
          select: { id: true, customerNumber: true, firstName: true, lastName: true, companyName: true },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const buckets = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
    const asOfMs = asOf.getTime();

    const rows = invoices.map((inv) => {
      const daysOverdue = inv.dueDate
        ? Math.max(0, Math.floor((asOfMs - new Date(inv.dueDate).getTime()) / 86_400_000))
        : 0;
      const balance = Number(inv.balance);

      if (daysOverdue <= 0) buckets.current += balance;
      else if (daysOverdue <= 30) buckets.days30 += balance;
      else if (daysOverdue <= 60) buckets.days60 += balance;
      else if (daysOverdue <= 90) buckets.days90 += balance;
      else buckets.over90 += balance;

      return {
        customer: inv.customer,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate,
        total: inv.total,
        amountPaid: inv.amountPaid,
        balance: inv.balance,
        daysOverdue,
      };
    });

    return { rows, buckets, asOf };
  }

  // ── AP Aging ──────────────────────────────────────────────────────────────

  async apAging(companyId: string, asOf: Date) {
    const bills = await this.prisma.supplierInvoice.findMany({
      where: {
        companyId,
        status: { in: ['POSTED', 'PARTIALLY_PAID'] },
      },
      include: {
        supplier: { select: { id: true, name: true, supplierNumber: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const buckets = { current: 0, days30: 0, days60: 0, days90: 0, over90: 0 };
    const asOfMs = asOf.getTime();

    const rows = bills.map((b) => {
      const daysOverdue = b.dueDate
        ? Math.max(0, Math.floor((asOfMs - new Date(b.dueDate).getTime()) / 86_400_000))
        : 0;
      const balance = Number(b.balance);

      if (daysOverdue <= 0) buckets.current += balance;
      else if (daysOverdue <= 30) buckets.days30 += balance;
      else if (daysOverdue <= 60) buckets.days60 += balance;
      else if (daysOverdue <= 90) buckets.days90 += balance;
      else buckets.over90 += balance;

      return {
        supplier: b.supplier,
        billNumber: b.internalNumber,
        billDate: b.invoiceDate,
        dueDate: b.dueDate,
        total: b.total,
        amountPaid: b.amountPaid,
        balance: b.balance,
        daysOverdue,
      };
    });

    return { rows, buckets, asOf };
  }

  // ── Customer Statement ────────────────────────────────────────────────────

  async customerStatement(companyId: string, customerId: string, fromDate: Date, toDate: Date) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId },
    });

    const [invoices, payments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { companyId, customerId, deletedAt: null, issueDate: { gte: fromDate, lte: toDate } },
        include: { items: true },
        orderBy: { issueDate: 'asc' },
      }),
      this.prisma.payment.findMany({
        where: { companyId, customerId, paymentDate: { gte: fromDate, lte: toDate } },
        orderBy: { paymentDate: 'asc' },
      }),
    ]);

    // Build chronological statement lines
    type Line = {
      date: Date; type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE';
      ref: string; description: string; debit: string; credit: string; balance: string;
    };
    const lines: Line[] = [];

    // Opening balance: AR balance before fromDate
    const openingAr = await this.prisma.invoice.aggregate({
      where: {
        companyId,
        customerId,
        deletedAt: null,
        status: { in: ['POSTED', 'PARTIALLY_PAID', 'OVERDUE', 'PAID'] },
        issueDate: { lt: fromDate },
      },
      _sum: { balance: true },
    });
    let running = new Decimal(openingAr._sum.balance?.toString() ?? '0');

    const allEvents: Array<{ date: Date; type: 'inv' | 'pay'; ref: any }> = [
      ...invoices.map((i) => ({ date: new Date(i.issueDate), type: 'inv' as const, ref: i })),
      ...payments.map((p) => ({ date: new Date(p.paymentDate), type: 'pay' as const, ref: p })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const ev of allEvents) {
      if (ev.type === 'inv') {
        const inv = ev.ref;
        const total = new Decimal(inv.total.toString());
        running = running.plus(total);
        lines.push({
          date: ev.date,
          type: inv.type,
          ref: inv.invoiceNumber,
          description: `Invoice ${inv.invoiceNumber}`,
          debit: total.toFixed(4),
          credit: '0.0000',
          balance: running.toFixed(4),
        });
      } else {
        const pay = ev.ref;
        const amount = new Decimal(pay.amount.toString());
        running = running.minus(amount);
        lines.push({
          date: ev.date,
          type: 'PAYMENT',
          ref: pay.receiptNumber,
          description: `Payment ${pay.receiptNumber} — ${pay.method}`,
          debit: '0.0000',
          credit: amount.toFixed(4),
          balance: running.toFixed(4),
        });
      }
    }

    return {
      customer,
      fromDate,
      toDate,
      openingBalance: new Decimal(openingAr._sum.balance?.toString() ?? '0').toFixed(4),
      lines,
      closingBalance: running.toFixed(4),
    };
  }

  // ── Inventory Valuation ───────────────────────────────────────────────────

  async inventoryValuation(companyId: string) {
    const materials = await this.prisma.material.findMany({
      where: { companyId, deletedAt: null },
      include: {
        stockLevels: { include: { warehouse: { select: { id: true, name: true } } } },
        category: { select: { name: true } },
      },
      orderBy: { sku: 'asc' },
    });

    let totalValue = new Decimal(0);
    const rows = materials.map((m) => {
      const avgCost = new Decimal(m.avgCost?.toString() ?? '0');
      const totalQty = m.stockLevels.reduce(
        (s, sl) => s.plus(new Decimal(sl.qtyOnHand.toString())),
        new Decimal(0),
      );
      const value = totalQty.mul(avgCost);
      totalValue = totalValue.plus(value);
      return {
        id: m.id,
        sku: m.sku,
        name: m.name,
        category: m.category?.name,
        uom: m.uom,
        avgCost: avgCost.toFixed(4),
        totalQty: totalQty.toFixed(4),
        value: value.toFixed(4),
        warehouses: m.stockLevels.map((sl) => ({
          warehouse: sl.warehouse.name,
          qty: new Decimal(sl.qtyOnHand.toString()).toFixed(4),
        })),
      };
    });

    return { rows, totalValue: totalValue.toFixed(4) };
  }
}
