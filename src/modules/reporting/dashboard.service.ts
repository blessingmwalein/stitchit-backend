import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import Decimal from 'decimal.js';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async kpis(companyId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const [
      revenueMonth,
      revenueYear,
      arBalance,
      apBalance,
      cashBalance,
      ordersInProduction,
      ordersThisMonth,
      jobsOverdue,
      lowStockCount,
      openInvoiceCount,
    ] = await Promise.all([
      // Revenue this month (posted sales revenue credit lines)
      this.prisma.journalLine.aggregate({
        where: {
          journalEntry: { companyId, status: 'POSTED', entryDate: { gte: startOfMonth } },
          account: { subtype: 'SALES_REVENUE' },
        },
        _sum: { credit: true },
      }),

      // Revenue this year
      this.prisma.journalLine.aggregate({
        where: {
          journalEntry: { companyId, status: 'POSTED', entryDate: { gte: startOfYear } },
          account: { subtype: 'SALES_REVENUE' },
        },
        _sum: { credit: true },
      }),

      // Outstanding AR (sum of invoice balances)
      this.prisma.invoice.aggregate({
        where: {
          companyId,
          status: { in: ['POSTED', 'PARTIALLY_PAID', 'OVERDUE'] },
          deletedAt: null,
        },
        _sum: { balance: true },
      }),

      // Outstanding AP (sum of supplier invoice balances)
      this.prisma.supplierInvoice.aggregate({
        where: { companyId, status: { in: ['POSTED', 'PARTIALLY_PAID'] } },
        _sum: { balance: true },
      }),

      // Cash position (CASH + BANK + MOBILE_WALLET accounts net balance)
      this.prisma.journalLine.aggregate({
        where: {
          journalEntry: { companyId, status: 'POSTED' },
          account: { subtype: { in: ['CASH', 'BANK', 'MOBILE_WALLET'] } },
        },
        _sum: { debit: true, credit: true },
      }),

      // Orders in production
      this.prisma.order.count({ where: { companyId, status: 'IN_PRODUCTION' } }),

      // New orders this month
      this.prisma.order.count({
        where: { companyId, createdAt: { gte: startOfMonth }, deletedAt: null },
      }),

      // Jobs overdue (IN_PROGRESS past scheduledEnd)
      this.prisma.productionJob.count({
        where: {
          companyId,
          status: { in: ['IN_PROGRESS', 'PENDING'] },
          scheduledEnd: { lt: now },
        },
      }),

      // Materials below reorder level
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count
        FROM "Material" m
        JOIN "StockLevel" sl ON sl."materialId" = m.id
        WHERE m."companyId" = ${companyId}
          AND m."reorderLevel" IS NOT NULL
          AND m."deletedAt" IS NULL
        GROUP BY m.id
        HAVING SUM(sl."qtyOnHand") < m."reorderLevel"
      `.then((rows) => Number(rows.length)),

      // Open (unpaid) invoices
      this.prisma.invoice.count({
        where: {
          companyId,
          status: { in: ['POSTED', 'PARTIALLY_PAID', 'OVERDUE'] },
          deletedAt: null,
        },
      }),
    ]);

    const cashNet = new Decimal(cashBalance._sum.debit?.toString() ?? '0')
      .minus(new Decimal(cashBalance._sum.credit?.toString() ?? '0'));

    return {
      revenue: {
        thisMonth: new Decimal(revenueMonth._sum.credit?.toString() ?? '0').toFixed(2),
        thisYear: new Decimal(revenueYear._sum.credit?.toString() ?? '0').toFixed(2),
      },
      receivables: {
        outstanding: new Decimal(arBalance._sum.balance?.toString() ?? '0').toFixed(2),
        openInvoices: openInvoiceCount,
      },
      payables: {
        outstanding: new Decimal(apBalance._sum.balance?.toString() ?? '0').toFixed(2),
      },
      cashPosition: cashNet.toFixed(2),
      production: {
        ordersInProduction,
        newOrdersThisMonth: ordersThisMonth,
        jobsOverdue,
      },
      inventory: { lowStockMaterials: lowStockCount },
      generatedAt: now,
    };
  }

  async recentActivity(companyId: string) {
    const [recentOrders, recentPayments, recentJobs] = await Promise.all([
      this.prisma.order.findMany({
        where: { companyId, deletedAt: null },
        include: {
          customer: { select: { firstName: true, lastName: true, companyName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.payment.findMany({
        where: { companyId },
        include: {
          customer: { select: { firstName: true, lastName: true, companyName: true } },
        },
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
