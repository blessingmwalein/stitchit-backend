import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PostingService } from '../accounting/posting.service';
import { NumberingService } from '../documents/numbering.service';
import { CreateInvoiceDto, UpdateInvoiceDto, InvoiceFilterDto } from './dto/invoicing.dto';
import Decimal from 'decimal.js';

const EDITABLE: string[] = ['DRAFT', 'POSTED', 'PARTIALLY_PAID'];

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
    private readonly numbering: NumberingService,
  ) {}

  async findAll(companyId: string, filter: InvoiceFilterDto) {
    const { status, customerId, fromDate, toDate, search, page = 1, limit = 20 } = filter;
    const where: any = { companyId, deletedAt: null };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (fromDate || toDate) {
      where.issueDate = {};
      if (fromDate) where.issueDate.gte = new Date(fromDate);
      if (toDate) where.issueDate.lte = new Date(toDate);
    }
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customer: { firstName: { contains: search, mode: 'insensitive' } } },
        { customer: { companyName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, customerNumber: true, firstName: true, lastName: true, companyName: true } },
          order: { select: { id: true, orderNumber: true } },
          allocations: {
            select: { id: true, amount: true },
          },
        },
        orderBy: { issueDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(companyId: string, id: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        customer: true,
        order: { select: { id: true, orderNumber: true } },
        items: { orderBy: { lineNo: 'asc' } },
        allocations: {
          include: {
            payment: {
              select: { id: true, receiptNumber: true, paymentDate: true, amount: true, method: true },
            },
          },
        },
      },
    });
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  async create(companyId: string, dto: CreateInvoiceDto, userId: string) {
    const subtotal = dto.items.reduce(
      (sum, item) => sum.plus(new Decimal(item.quantity).mul(item.unitPrice)),
      new Decimal(0),
    );
    const discountTotal = new Decimal(dto.discountTotal ?? 0);
    const taxTotal = new Decimal(dto.taxTotal ?? 0);
    const total = subtotal.minus(discountTotal).plus(taxTotal);

    const invoiceNumber = await this.numbering.next(companyId, 'INVOICE');

    return this.prisma.invoice.create({
      data: {
        companyId,
        invoiceNumber,
        type: dto.type ?? 'INVOICE',
        customerId: dto.customerId,
        orderId: dto.orderId,
        status: 'DRAFT',
        issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        currencyCode: dto.currencyCode ?? 'USD',
        exchangeRate: dto.exchangeRate ?? 1,
        subtotal: subtotal.toDecimalPlaces(4).toString(),
        discountTotal: discountTotal.toDecimalPlaces(4).toString(),
        taxTotal: taxTotal.toDecimalPlaces(4).toString(),
        total: total.toDecimalPlaces(4).toString(),
        balance: total.toDecimalPlaces(4).toString(),
        notes: dto.notes,
        createdByUserId: userId,
        items: {
          create: dto.items.map((item) => ({
            lineNo: item.lineNo,
            description: item.description,
            quantity: new Decimal(item.quantity).toString(),
            unitPrice: new Decimal(item.unitPrice).toString(),
            lineTotal: new Decimal(item.quantity).mul(item.unitPrice).toDecimalPlaces(4).toString(),
          })),
        },
      },
      include: { items: true },
    });
  }

  async update(companyId: string, id: string, dto: UpdateInvoiceDto) {
    const inv = await this.findOne(companyId, id);
    if (!EDITABLE.includes(inv.status)) {
      throw new BadRequestException(`Invoice in ${inv.status} status cannot be edited`);
    }
    return this.prisma.invoice.update({
      where: { id },
      data: {
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        notes: dto.notes,
      },
    });
  }

  async post(companyId: string, id: string, userId: string) {
    const inv = await this.findOne(companyId, id);
    if (inv.status !== 'DRAFT') throw new BadRequestException('Only DRAFT invoices can be posted');

    return this.prisma.$transaction(async (tx) => {
      const jeId = await this.posting.postInvoice({
        companyId,
        invoiceId: id,
        customerId: inv.customerId,
        orderId: inv.orderId ?? undefined,
        subtotal: new Decimal(inv.subtotal.toString()),
        taxTotal: new Decimal(inv.taxTotal.toString()),
        total: new Decimal(inv.total.toString()),
        date: new Date(inv.issueDate),
        userId,
        tx,
      });

      return tx.invoice.update({
        where: { id },
        data: { status: 'POSTED', journalEntryId: jeId },
      });
    });
  }

  async void(companyId: string, id: string) {
    const inv = await this.findOne(companyId, id);
    if (inv.status === 'PAID') throw new BadRequestException('Cannot void a fully paid invoice');
    return this.prisma.invoice.update({ where: { id }, data: { status: 'VOID' } });
  }

  async markPaid(companyId: string, id: string) {
    const inv = await this.findOne(companyId, id);
    if (!['POSTED', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status)) {
      throw new BadRequestException(`Invoice in ${inv.status} status cannot be marked as paid`);
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { status: 'PAID', balance: 0, amountPaid: inv.total },
    });
  }

  async softDelete(companyId: string, id: string) {
    const inv = await this.findOne(companyId, id);
    if (inv.status !== 'DRAFT') throw new BadRequestException('Only DRAFT invoices can be deleted');
    return this.prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
  }

}
