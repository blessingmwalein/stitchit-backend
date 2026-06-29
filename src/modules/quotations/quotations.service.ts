import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../documents/numbering.service';
import { AuditService } from '../audit/audit.service';
import { DocType, QuotationStatus, DocSource, OrderStatus } from '@prisma/client';
import {
  CreateQuotationDto,
  UpdateQuotationDto,
  SendQuotationDto,
  RejectQuotationDto,
  QuotationFilterDto,
} from './dto/quotations.dto';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import Decimal from 'decimal.js';

function calcTotals(items: { quantity: number; unitPrice: number; discount?: number }[]) {
  let subtotal = new Decimal(0);
  let discountTotal = new Decimal(0);

  for (const item of items) {
    const qty = new Decimal(item.quantity);
    const price = new Decimal(item.unitPrice);
    const discount = new Decimal(item.discount ?? 0);
    const lineTotal = qty.mul(price).minus(discount);
    subtotal = subtotal.plus(qty.mul(price));
    discountTotal = discountTotal.plus(discount);
  }

  const total = subtotal.minus(discountTotal);
  return { subtotal, discountTotal, taxTotal: new Decimal(0), total };
}

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
  ) {}

  async create(companyId: string, dto: CreateQuotationDto, userId?: string) {
    const quotationNumber = await this.numbering.next(companyId, DocType.QUOTATION);
    const totals = calcTotals(dto.items);

    const quotation = await this.prisma.quotation.create({
      data: {
        companyId,
        quotationNumber,
        customerId: dto.customerId,
        leadId: dto.leadId,
        source: DocSource.STAFF,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date(),
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        currencyCode: dto.currencyCode ?? 'USD',
        exchangeRate: dto.exchangeRate ?? 1,
        subtotal: totals.subtotal.toFixed(4),
        discountTotal: totals.discountTotal.toFixed(4),
        taxTotal: totals.taxTotal.toFixed(4),
        total: totals.total.toFixed(4),
        notes: dto.notes,
        terms: dto.terms,
        createdByUserId: userId,
        items: {
          create: dto.items.map((item) => ({
            lineNo: item.lineNo,
            description: item.description,
            rugSpec: item.rugSpec ?? undefined,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount ?? 0,
            lineTotal: new Decimal(item.quantity).mul(item.unitPrice).minus(item.discount ?? 0).toFixed(4),
          })),
        },
      },
      include: { items: { orderBy: { lineNo: 'asc' } }, customer: true },
    });

    await this.audit.log({ companyId, userId, action: 'quotations.create', entityType: 'Quotation', entityId: quotation.id, newValue: quotation });
    return quotation;
  }

  async findAll(companyId: string, filter: QuotationFilterDto, pagination: PaginationDto) {
    const where = {
      companyId,
      deletedAt: null,
      ...(filter.status && { status: filter.status }),
      ...(filter.customerId && { customerId: filter.customerId }),
      ...(filter.leadId && { leadId: filter.leadId }),
      ...(filter.search && {
        OR: [
          { quotationNumber: { contains: filter.search, mode: 'insensitive' as const } },
          { customer: { firstName: { contains: filter.search, mode: 'insensitive' as const } } },
          { customer: { companyName: { contains: filter.search, mode: 'insensitive' as const } } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.quotation.findMany({
        where,
        include: {
          customer: { select: { id: true, customerNumber: true, firstName: true, lastName: true, companyName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.quotation.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  async findOne(companyId: string, id: string) {
    const q = await this.prisma.quotation.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        items: { orderBy: { lineNo: 'asc' } },
        customer: true,
        lead: { select: { id: true, leadNumber: true, name: true } },
      },
    });
    if (!q) throw new NotFoundException('Quotation not found');
    return q;
  }

  async update(companyId: string, id: string, dto: UpdateQuotationDto, userId?: string) {
    const q = await this.prisma.quotation.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!q) throw new NotFoundException('Quotation not found');
    if (q.status !== QuotationStatus.DRAFT) {
      throw new BadRequestException(`Cannot edit a quotation in ${q.status} status`);
    }

    const itemsToUpdate = dto.items;
    const totals = itemsToUpdate ? calcTotals(itemsToUpdate) : null;

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: {
        ...(dto.customerId !== undefined && { customerId: dto.customerId }),
        ...(dto.leadId !== undefined && { leadId: dto.leadId }),
        ...(dto.expiryDate !== undefined && { expiryDate: new Date(dto.expiryDate) }),
        ...(dto.currencyCode !== undefined && { currencyCode: dto.currencyCode }),
        ...(dto.exchangeRate !== undefined && { exchangeRate: dto.exchangeRate }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.terms !== undefined && { terms: dto.terms }),
        ...(totals && {
          subtotal: totals.subtotal.toFixed(4),
          discountTotal: totals.discountTotal.toFixed(4),
          taxTotal: totals.taxTotal.toFixed(4),
          total: totals.total.toFixed(4),
        }),
        ...(itemsToUpdate && {
          items: {
            deleteMany: {},
            create: itemsToUpdate.map((item) => ({
              lineNo: item.lineNo,
              description: item.description,
              rugSpec: item.rugSpec ?? undefined,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount ?? 0,
              lineTotal: new Decimal(item.quantity).mul(item.unitPrice).minus(item.discount ?? 0).toFixed(4),
            })),
          },
        }),
      },
      include: { items: { orderBy: { lineNo: 'asc' } }, customer: true },
    });

    await this.audit.log({ companyId, userId, action: 'quotations.update', entityType: 'Quotation', entityId: id });
    return updated;
  }

  async send(companyId: string, id: string, _dto: SendQuotationDto, userId?: string) {
    const q = await this.prisma.quotation.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!q) throw new NotFoundException('Quotation not found');
    if (q.status !== QuotationStatus.DRAFT) {
      throw new BadRequestException(`Quotation is already ${q.status}`);
    }

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: QuotationStatus.SENT, sentAt: new Date() },
    });

    await this.audit.log({ companyId, userId, action: 'quotations.send', entityType: 'Quotation', entityId: id });
    return updated;
  }

  async approve(companyId: string, id: string, userId?: string) {
    const q = await this.prisma.quotation.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!q) throw new NotFoundException('Quotation not found');
    if (q.status !== QuotationStatus.SENT) {
      throw new BadRequestException(`Can only approve a SENT quotation (current: ${q.status})`);
    }

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: QuotationStatus.APPROVED, approvedAt: new Date() },
    });

    await this.audit.log({ companyId, userId, action: 'quotations.approve', entityType: 'Quotation', entityId: id });
    return updated;
  }

  async reject(companyId: string, id: string, dto: RejectQuotationDto, userId?: string) {
    const q = await this.prisma.quotation.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!q) throw new NotFoundException('Quotation not found');
    if (!([QuotationStatus.SENT, QuotationStatus.DRAFT] as QuotationStatus[]).includes(q.status)) {
      throw new BadRequestException(`Cannot reject a quotation in ${q.status} status`);
    }

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status: QuotationStatus.REJECTED, rejectedAt: new Date(), rejectionReason: dto.reason },
    });

    await this.audit.log({ companyId, userId, action: 'quotations.reject', entityType: 'Quotation', entityId: id });
    return updated;
  }

  async convertToOrder(companyId: string, id: string, userId?: string) {
    const q = await this.prisma.quotation.findFirst({
      where: { id, companyId, deletedAt: null },
      include: { items: { orderBy: { lineNo: 'asc' } } },
    });
    if (!q) throw new NotFoundException('Quotation not found');
    if (q.status !== QuotationStatus.APPROVED) {
      throw new BadRequestException('Only an APPROVED quotation can be converted to an order');
    }
    if (q.convertedOrderId) throw new ConflictException('Quotation already converted to an order');
    if (!q.customerId) throw new BadRequestException('Quotation must be linked to a customer before converting');

    const orderNumber = await this.numbering.next(companyId, DocType.ORDER);

    const order = await this.prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          companyId,
          orderNumber,
          customerId: q.customerId!,
          status: OrderStatus.QUOTED,
          source: q.source,
          currencyCode: q.currencyCode,
          exchangeRate: q.exchangeRate,
          subtotal: q.subtotal,
          discountTotal: q.discountTotal,
          taxTotal: q.taxTotal,
          total: q.total,
          depositRequired: new Decimal(q.total.toString()).mul(0.5).toDecimalPlaces(4).toString(),
          notes: q.notes ?? undefined,
          createdByUserId: userId,
          items: {
            create: q.items.map((item) => {
              const spec = (item.rugSpec ?? {}) as Record<string, any>;
              return {
                lineNo: item.lineNo,
                rugName: (spec.rugName as string) || item.description,
                description: item.description,
                widthCm: (spec.widthCm as number) ?? 100,
                heightCm: (spec.heightCm as number) ?? 100,
                displayUnit: (spec.unit as any) ?? 'CM',
                shape: (spec.shape as any) ?? 'RECTANGLE',
                colors: (spec.colors as string[]) ?? [],
                complexity: (spec.complexity as any) ?? 'MEDIUM',
                quantity: Number(item.quantity),
                unitPrice: item.unitPrice,
                lineTotal: item.lineTotal,
              };
            }),
          },
          statusHistory: {
            create: { toStatus: OrderStatus.QUOTED, changedByUserId: userId, note: `Created from quotation ${q.quotationNumber}` },
          },
        },
        include: { items: true },
      });

      await tx.quotation.update({ where: { id }, data: { convertedOrderId: o.id } });
      return o;
    });

    await this.audit.log({ companyId, userId, action: 'quotations.convert', entityType: 'Quotation', entityId: id, newValue: { orderId: order.id } });
    return order;
  }

  async remove(companyId: string, id: string, userId?: string) {
    const q = await this.prisma.quotation.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!q) throw new NotFoundException('Quotation not found');
    if (!([QuotationStatus.DRAFT, QuotationStatus.REJECTED] as QuotationStatus[]).includes(q.status)) {
      throw new BadRequestException('Only DRAFT or REJECTED quotations can be deleted');
    }

    await this.prisma.quotation.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ companyId, userId, action: 'quotations.delete', entityType: 'Quotation', entityId: id });
  }
}
