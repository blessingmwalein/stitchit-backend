import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PostingService } from '../accounting/posting.service';
import { NumberingService } from '../documents/numbering.service';
import { CreatePaymentDto, AllocateDto, PaymentFilterDto } from './dto/invoicing.dto';
import Decimal from 'decimal.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
    private readonly numbering: NumberingService,
  ) {}

  async findAll(companyId: string, filter: PaymentFilterDto) {
    const { customerId, method, isDeposit, fromDate, toDate, page = 1, limit = 20 } = filter;
    const where: any = { companyId };
    if (customerId) where.customerId = customerId;
    if (method) where.method = method;
    if (isDeposit !== undefined) where.isDeposit = isDeposit;
    if (fromDate || toDate) {
      where.paymentDate = {};
      if (fromDate) where.paymentDate.gte = new Date(fromDate);
      if (toDate) where.paymentDate.lte = new Date(toDate);
    }
    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: {
          customer: { select: { id: true, customerNumber: true, firstName: true, lastName: true, companyName: true } },
          order: { select: { id: true, orderNumber: true } },
          allocations: { include: { invoice: { select: { id: true, invoiceNumber: true } } } },
        },
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(companyId: string, id: string) {
    const p = await this.prisma.payment.findFirst({
      where: { id, companyId },
      include: {
        customer: true,
        order: { select: { id: true, orderNumber: true, total: true, balance: true } },
        allocations: {
          include: {
            invoice: { select: { id: true, invoiceNumber: true, total: true, balance: true } },
          },
        },
      },
    });
    if (!p) throw new NotFoundException('Payment not found');
    return p;
  }

  async create(companyId: string, dto: CreatePaymentDto, userId: string) {
    const amount = new Decimal(dto.amount);
    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();

    return this.prisma.$transaction(async (tx) => {
      // 1. Create the payment record first to get a real ID
      const receiptNumber = await this.numbering.next(companyId, 'PAYMENT', tx);
      const payment = await tx.payment.create({
        data: {
          companyId,
          receiptNumber,
          customerId: dto.customerId,
          orderId: dto.orderId,
          method: dto.method,
          amount: amount.toString(),
          currencyCode: dto.currencyCode ?? 'USD',
          exchangeRate: dto.exchangeRate ?? 1,
          paymentDate,
          isDeposit: dto.isDeposit ?? false,
          reference: dto.reference,
          notes: dto.notes,
          createdByUserId: userId,
        },
      });

      // 2. Post the journal entry with the real payment ID
      let jeId: string;
      if (dto.isDeposit) {
        jeId = await this.posting.postDeposit({
          companyId,
          paymentId: payment.id,
          customerId: dto.customerId,
          orderId: dto.orderId,
          amount,
          method: dto.method,
          date: paymentDate,
          userId,
          tx,
        });
      } else {
        jeId = await this.posting.postPayment({
          companyId,
          paymentId: payment.id,
          customerId: dto.customerId,
          orderId: dto.orderId,
          amount,
          method: dto.method,
          date: paymentDate,
          userId,
          tx,
        });
      }

      // 3. Save JE reference back to payment
      await tx.payment.update({ where: { id: payment.id }, data: { journalEntryId: jeId } });

      // 4. Apply allocations if provided
      if (dto.allocations?.length) {
        let remaining = amount;
        for (const alloc of dto.allocations) {
          const allocAmt = new Decimal(alloc.amount);
          if (allocAmt.gt(remaining)) {
            throw new BadRequestException('Allocation amount exceeds payment amount');
          }
          remaining = remaining.minus(allocAmt);

          if (dto.isDeposit) {
            await this.applyDepositAllocation(tx, companyId, payment.id, alloc.invoiceId, allocAmt, dto.customerId, dto.orderId, userId);
          } else {
            await this.applyDirectAllocation(tx, payment.id, alloc.invoiceId, allocAmt);
          }
        }
      }

      return payment;
    });
  }

  /** Allocate a previously recorded payment to an invoice */
  async allocate(companyId: string, paymentId: string, dto: AllocateDto, userId: string) {
    const payment = await this.findOne(companyId, paymentId);
    const allocAmt = new Decimal(dto.amount);
    const alreadyAllocated = payment.allocations.reduce(
      (s, a) => s.plus(new Decimal(a.amount.toString())),
      new Decimal(0),
    );
    const remaining = new Decimal(payment.amount.toString()).minus(alreadyAllocated);
    if (allocAmt.gt(remaining)) {
      throw new BadRequestException(`Amount exceeds unallocated balance of ${remaining.toFixed(2)}`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (payment.isDeposit) {
        await this.applyDepositAllocation(tx, companyId, paymentId, dto.invoiceId, allocAmt, payment.customerId, payment.orderId ?? undefined, userId);
      } else {
        await this.applyDirectAllocation(tx, paymentId, dto.invoiceId, allocAmt);
      }
    });
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async applyDirectAllocation(
    tx: Prisma.TransactionClient,
    paymentId: string,
    invoiceId: string,
    amount: Decimal,
  ) {
    await tx.paymentAllocation.create({
      data: { paymentId, invoiceId, amount: amount.toString() },
    });
    await this.updateInvoiceBalance(tx, invoiceId, amount);
  }

  private async applyDepositAllocation(
    tx: Prisma.TransactionClient,
    companyId: string,
    paymentId: string,
    invoiceId: string,
    amount: Decimal,
    customerId: string,
    orderId: string | undefined,
    userId: string,
  ) {
    const allocationKey = `${paymentId}:${invoiceId}`;
    const jeId = await this.posting.postDepositApplication({
      companyId,
      allocationId: allocationKey,
      customerId,
      orderId,
      amount,
      userId,
      tx,
    });
    await tx.paymentAllocation.create({
      data: { paymentId, invoiceId, amount: amount.toString(), journalEntryId: jeId },
    });
    await this.updateInvoiceBalance(tx, invoiceId, amount);
  }

  private async updateInvoiceBalance(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    amount: Decimal,
  ) {
    const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const newAmountPaid = new Decimal(inv.amountPaid.toString()).plus(amount);
    const newBalance = Decimal.max(
      new Decimal(0),
      new Decimal(inv.total.toString()).minus(newAmountPaid),
    );
    const status =
      newBalance.isZero() ? 'PAID'
      : newAmountPaid.gt(0) ? 'PARTIALLY_PAID'
      : inv.status;

    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: newAmountPaid.toDecimalPlaces(4).toString(),
        balance: newBalance.toDecimalPlaces(4).toString(),
        status,
      },
    });
  }

}
