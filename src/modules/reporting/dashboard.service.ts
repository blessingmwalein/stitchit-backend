import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import Decimal from 'decimal.js';

function monthStart(y: number, m: number) {
  return new Date(y, m, 1);
}
function monthEnd(y: number, m: number) {
  return new Date(y, m + 1, 0, 23, 59, 59, 999);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async kpis(companyId: string) {
    const now = new Date();
    const yr  = now.getFullYear();
    const mo  = now.getMonth(); // 0-based
    const startOfMonth = monthStart(yr, mo);
    const endOfMonth   = monthEnd(yr, mo);

    // Build last-6-months date array (oldest first)
    const months: { label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      let m = mo - i;
      let y = yr;
      if (m < 0) { m += 12; y -= 1; }
      months.push({
        label: monthStart(y, m).toLocaleString('en-US', { month: 'short', year: '2-digit' }),
        start: monthStart(y, m),
        end:   monthEnd(y, m),
      });
    }

    const [
      monthlyPayments,
      allTimePayments,
      outstandingOrders,
      monthlyExpenses,
      cashJournal,
      ordersInProduction,
      ordersThisMonth,
      jobsOverdue,
      lowStockCount,
    ] = await Promise.all([

      // Income this month — actual cash received from customers (deposits + balances)
      this.prisma.payment.aggregate({
        where: { companyId, paymentDate: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),

      // Capital — total money ever received from customers
      this.prisma.payment.aggregate({
        where: { companyId },
        _sum: { amount: true },
      }),

      // Total outstanding balance on all active orders
      this.prisma.order.aggregate({
        where: { companyId, deletedAt: null, balance: { gt: 0 } },
        _sum: { balance: true },
      }),

      // Monthly expenses — sum of expense entries this month
      this.prisma.expenseEntry.aggregate({
        where: { companyId, date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),

      // Cash balance from GL (CASH + BANK + MOBILE_WALLET net)
      this.prisma.journalLine.aggregate({
        where: {
          journalEntry: { companyId, status: 'POSTED' },
          account: { subtype: { in: ['CASH', 'BANK', 'MOBILE_WALLET'] } },
        },
        _sum: { debit: true, credit: true },
      }),

      // Orders in production
      this.prisma.order.count({ where: { companyId, status: 'IN_PRODUCTION', deletedAt: null } }),

      // New orders this month
      this.prisma.order.count({ where: { companyId, createdAt: { gte: startOfMonth }, deletedAt: null } }),

      // Jobs overdue
      this.prisma.productionJob.count({
        where: { companyId, status: { in: ['IN_PROGRESS', 'PENDING'] }, scheduledEnd: { lt: now } },
      }),

      // Low stock materials
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "Material" m
        JOIN "StockLevel" sl ON sl."materialId" = m.id
        WHERE m."companyId" = ${companyId} AND m."reorderLevel" IS NOT NULL AND m."deletedAt" IS NULL
        GROUP BY m.id HAVING SUM(sl."qtyOnHand") < m."reorderLevel"
      `.then((r) => Number(r.length)),
    ]);

    // Orders by status for pipeline view
    const ordersByStatusRaw = await this.prisma.order.groupBy({
      by: ['status'],
      where: { companyId, deletedAt: null },
      _count: { _all: true },
    });

    // 6-month income + expense chart
    const chartData = await Promise.all(
      months.map(async ({ label, start, end }) => {
        const [inc, exp] = await Promise.all([
          this.prisma.payment.aggregate({
            where: { companyId, paymentDate: { gte: start, lte: end } },
            _sum: { amount: true },
          }),
          this.prisma.expenseEntry.aggregate({
            where: { companyId, date: { gte: start, lte: end } },
            _sum: { amount: true },
          }),
        ]);
        return {
          month:    label,
          income:   Number(new Decimal(inc._sum.amount?.toString() ?? '0').toFixed(2)),
          expenses: Number(new Decimal(exp._sum.amount?.toString()  ?? '0').toFixed(2)),
        };
      }),
    );

    const cashNet = new Decimal(cashJournal._sum.debit?.toString()  ?? '0')
      .minus(new Decimal(cashJournal._sum.credit?.toString() ?? '0'));

    return {
      // 5 stat cards
      monthlyIncome:      Number(new Decimal(monthlyPayments._sum.amount?.toString() ?? '0').toFixed(2)),
      capital:            Number(new Decimal(allTimePayments._sum.amount?.toString() ?? '0').toFixed(2)),
      cashBalance:        Number(cashNet.toFixed(2)),
      outstandingBalance: Number(new Decimal(outstandingOrders._sum.balance?.toString() ?? '0').toFixed(2)),
      monthlyExpenses:    Number(new Decimal(monthlyExpenses._sum.amount?.toString() ?? '0').toFixed(2)),

      // Chart
      revenueChart: chartData,

      // Operational
      ordersInProduction,
      newOrdersMtd: ordersThisMonth,
      jobsOverdue,
      lowStockCount,

      // Pipeline
      ordersByStatus: ordersByStatusRaw.map((r) => ({ status: r.status, count: r._count._all })),
    };
  }

  async recentActivity(companyId: string) {
    const [recentOrders, recentPayments, recentJobs] = await Promise.all([
      this.prisma.order.findMany({
        where: { companyId, deletedAt: null },
        include: { customer: { select: { firstName: true, lastName: true, companyName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.payment.findMany({
        where: { companyId },
        include: { customer: { select: { firstName: true, lastName: true, companyName: true } } },
        orderBy: { paymentDate: 'desc' },
        take: 5,
      }),
      this.prisma.productionJob.findMany({
        where: { companyId, status: { in: ['IN_PROGRESS', 'COMPLETED'] } },
        include: { order: { select: { orderNumber: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
    ]);

    return { recentOrders, recentPayments, recentJobs };
  }
}
