import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../documents/numbering.service';
import { AuditService } from '../audit/audit.service';
import { DocType, OrderStatus, OrderPriority, DocSource } from '@prisma/client';
import {
  CreateOrderDto,
  UpdateOrderDto,
  ChangeOrderStatusDto,
  AddAttachmentDto,
  OrderFilterDto,
} from './dto/orders.dto';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import Decimal from 'decimal.js';

// Valid forward/backward transitions for the order state machine
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: [OrderStatus.QUOTED, OrderStatus.CANCELLED],
  QUOTED: [OrderStatus.AWAITING_DEPOSIT, OrderStatus.CANCELLED],
  AWAITING_DEPOSIT: [OrderStatus.DEPOSIT_PAID, OrderStatus.CANCELLED],
  DEPOSIT_PAID: [OrderStatus.IN_PRODUCTION, OrderStatus.CANCELLED],
  IN_PRODUCTION: [OrderStatus.QUALITY_CHECK, OrderStatus.CANCELLED],
  QUALITY_CHECK: [OrderStatus.READY, OrderStatus.IN_PRODUCTION],
  READY: [OrderStatus.DELIVERED],
  DELIVERED: [OrderStatus.CLOSED],
  CLOSED: [],
  CANCELLED: [],
};

function calcOrderTotals(items: { unitPrice: number; quantity?: number }[]) {
  let total = new Decimal(0);
  for (const item of items) {
    total = total.plus(new Decimal(item.unitPrice).mul(item.quantity ?? 1));
  }
  return { subtotal: total, discountTotal: new Decimal(0), taxTotal: new Decimal(0), total };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
  ) {}

  async create(companyId: string, dto: CreateOrderDto, userId?: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, companyId, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found');

    const orderNumber = await this.numbering.next(companyId, DocType.ORDER);
    const totals = calcOrderTotals(dto.items);
    const depositRequired = dto.depositRequired !== undefined
      ? new Decimal(dto.depositRequired)
      : totals.total.mul(0.5);

    const order = await this.prisma.order.create({
      data: {
        companyId,
        orderNumber,
        customerId: dto.customerId,
        status: OrderStatus.DRAFT,
        priority: dto.priority ?? OrderPriority.NORMAL,
        source: DocSource.STAFF,
        promisedDate: dto.promisedDate ? new Date(dto.promisedDate) : undefined,
        currencyCode: dto.currencyCode ?? 'USD',
        exchangeRate: dto.exchangeRate ?? 1,
        subtotal: totals.subtotal.toFixed(4),
        discountTotal: totals.discountTotal.toFixed(4),
        taxTotal: totals.taxTotal.toFixed(4),
        total: totals.total.toFixed(4),
        depositRequired: depositRequired.toDecimalPlaces(4).toFixed(4),
        balance: totals.total.toFixed(4),
        deliveryAddress: dto.deliveryAddress,
        notes: dto.notes,
        createdByUserId: userId,
        items: {
          create: dto.items.map((item) => ({
            lineNo: item.lineNo,
            rugName: item.rugName,
            description: item.description,
            widthCm: item.widthCm,
            heightCm: item.heightCm,
            displayUnit: item.displayUnit ?? 'CM',
            shape: item.shape ?? 'RECTANGLE',
            colors: item.colors ?? [],
            complexity: item.complexity ?? 'MEDIUM',
            designFileId: item.designFileId,
            designFileUrl: item.designFileUrl,
            quantity: item.quantity ?? 1,
            unitPrice: item.unitPrice,
            lineTotal: new Decimal(item.unitPrice).mul(item.quantity ?? 1).toFixed(4),
            notes: item.notes,
          })),
        },
        statusHistory: {
          create: { toStatus: OrderStatus.DRAFT, changedByUserId: userId, note: 'Order created' },
        },
      },
      include: { items: { orderBy: { lineNo: 'asc' } }, customer: true },
    });

    await this.audit.log({ companyId, userId, action: 'orders.create', entityType: 'Order', entityId: order.id, newValue: order });
    return order;
  }

  async findAll(companyId: string, filter: OrderFilterDto, pagination: PaginationDto) {
    const where = {
      companyId,
      deletedAt: null,
      ...(filter.status && { status: filter.status }),
      ...(filter.priority && { priority: filter.priority }),
      ...(filter.customerId && { customerId: filter.customerId }),
      ...(filter.search && {
        OR: [
          { orderNumber: { contains: filter.search, mode: 'insensitive' as const } },
          { customer: { firstName: { contains: filter.search, mode: 'insensitive' as const } } },
          { customer: { companyName: { contains: filter.search, mode: 'insensitive' as const } } },
          { items: { some: { rugName: { contains: filter.search, mode: 'insensitive' as const } } } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: {
          customer: { select: { id: true, customerNumber: true, firstName: true, lastName: true, companyName: true } },
          items: { select: { id: true, designFileUrl: true }, orderBy: { lineNo: 'asc' } },
          _count: { select: { items: true } },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.order.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  async findOne(companyId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        customer: true,
        items: { orderBy: { lineNo: 'asc' } },
        attachments: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        productionJobs: {
          include: {
            stages: {
              include: { stageDef: true },
              orderBy: { stageDef: { sequence: 'asc' } },
            },
          },
        },
        quotation: { select: { id: true, quotationNumber: true, status: true } },
        invoices: { select: { id: true, total: true, status: true, createdAt: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async update(companyId: string, id: string, dto: UpdateOrderDto, userId?: string) {
    const order = await this.prisma.order.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!order) throw new NotFoundException('Order not found');

    const editableStatuses: OrderStatus[] = [OrderStatus.DRAFT, OrderStatus.QUOTED, OrderStatus.AWAITING_DEPOSIT];
    if (!editableStatuses.includes(order.status)) {
      throw new BadRequestException(`Order in ${order.status} status cannot be edited`);
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.promisedDate !== undefined && { promisedDate: new Date(dto.promisedDate) }),
        ...(dto.deliveryAddress !== undefined && { deliveryAddress: dto.deliveryAddress }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.depositRequired !== undefined && { depositRequired: dto.depositRequired }),
      },
    });

    await this.audit.log({ companyId, userId, action: 'orders.update', entityType: 'Order', entityId: id });
    return updated;
  }

  async changeStatus(companyId: string, id: string, dto: ChangeOrderStatusDto, userId?: string) {
    const order = await this.prisma.order.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!order) throw new NotFoundException('Order not found');

    const allowed = VALID_TRANSITIONS[order.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${dto.status}. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === OrderStatus.DELIVERED && { deliveredAt: new Date() }),
        statusHistory: {
          create: {
            fromStatus: order.status,
            toStatus: dto.status,
            changedByUserId: userId,
            note: dto.note,
          },
        },
      },
    });

    await this.audit.log({ companyId, userId, action: 'orders.status_change', entityType: 'Order', entityId: id, oldValue: { status: order.status }, newValue: { status: dto.status } });
    return updated;
  }

  async addAttachment(companyId: string, id: string, dto: AddAttachmentDto, userId?: string) {
    const order = await this.prisma.order.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!order) throw new NotFoundException('Order not found');

    const file = await this.prisma.fileObject.findFirst({ where: { id: dto.fileId, companyId } });
    if (!file) throw new NotFoundException('File not found');

    const attachment = await this.prisma.orderAttachment.create({
      data: { orderId: id, fileId: dto.fileId, label: dto.label, kind: dto.kind },
    });

    await this.audit.log({ companyId, userId, action: 'orders.attachment_add', entityType: 'Order', entityId: id });
    return attachment;
  }

  async removeAttachment(companyId: string, orderId: string, attachmentId: string, userId?: string) {
    const attachment = await this.prisma.orderAttachment.findFirst({
      where: { id: attachmentId, orderId },
      include: { order: { select: { companyId: true } } },
    });
    if (!attachment || attachment.order.companyId !== companyId) {
      throw new NotFoundException('Attachment not found');
    }

    await this.prisma.orderAttachment.delete({ where: { id: attachmentId } });
    await this.audit.log({ companyId, userId, action: 'orders.attachment_remove', entityType: 'Order', entityId: orderId });
  }

  async remove(companyId: string, id: string, userId?: string) {
    const order = await this.prisma.order.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!order) throw new NotFoundException('Order not found');

    const cancellableStatuses: OrderStatus[] = [OrderStatus.DRAFT, OrderStatus.QUOTED, OrderStatus.AWAITING_DEPOSIT, OrderStatus.CANCELLED];
    if (!cancellableStatuses.includes(order.status)) {
      throw new BadRequestException(`Order in ${order.status} status cannot be deleted`);
    }

    await this.prisma.order.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ companyId, userId, action: 'orders.delete', entityType: 'Order', entityId: id });
  }
}
