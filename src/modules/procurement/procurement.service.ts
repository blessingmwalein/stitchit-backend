import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../documents/numbering.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from '../inventory/stock.service';
import {
  DocType, PurchaseOrderStatus, SupplierInvoiceStatus, StockMovementType,
} from '@prisma/client';
import {
  CreateSupplierDto, UpdateSupplierDto,
  CreatePurchaseOrderDto, UpdatePurchaseOrderDto,
  CreateGrnDto, CreateSupplierInvoiceDto, CreateSupplierPaymentDto,
  PoFilterDto, SupplierFilterDto,
} from './dto/procurement.dto';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import Decimal from 'decimal.js';

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
  ) {}

  // ── Suppliers ──────────────────────────────────────────────────────────────

  async createSupplier(companyId: string, dto: CreateSupplierDto, userId?: string) {
    const supplierNumber = await this.numbering.next(companyId, DocType.SUPPLIER);
    const supplier = await this.prisma.supplier.create({
      data: { companyId, supplierNumber, ...dto },
    });
    await this.audit.log({ companyId, userId, action: 'procurement.supplier_create', entityType: 'Supplier', entityId: supplier.id });
    return supplier;
  }

  async findAllSuppliers(companyId: string, filter: SupplierFilterDto, pagination: PaginationDto) {
    const where = {
      companyId,
      deletedAt: null,
      ...(filter.search && {
        OR: [
          { name: { contains: filter.search, mode: 'insensitive' as const } },
          { supplierNumber: { contains: filter.search, mode: 'insensitive' as const } },
          { email: { contains: filter.search, mode: 'insensitive' as const } },
          { phone: { contains: filter.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        include: { _count: { select: { purchaseOrders: true, invoices: true } } },
        orderBy: { name: 'asc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  async findOneSupplier(companyId: string, id: string) {
    const s = await this.prisma.supplier.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        purchaseOrders: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 10 },
        invoices: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 10 },
        _count: { select: { purchaseOrders: true, grns: true, invoices: true, payments: true } },
      },
    });
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }

  async updateSupplier(companyId: string, id: string, dto: UpdateSupplierDto, userId?: string) {
    const s = await this.prisma.supplier.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!s) throw new NotFoundException('Supplier not found');
    const updated = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.audit.log({ companyId, userId, action: 'procurement.supplier_update', entityType: 'Supplier', entityId: id });
    return updated;
  }

  async deleteSupplier(companyId: string, id: string, userId?: string) {
    const s = await this.prisma.supplier.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!s) throw new NotFoundException('Supplier not found');
    await this.prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ companyId, userId, action: 'procurement.supplier_delete', entityType: 'Supplier', entityId: id });
  }

  // ── Purchase Orders ────────────────────────────────────────────────────────

  async createPO(companyId: string, dto: CreatePurchaseOrderDto, userId?: string) {
    const poNumber = await this.numbering.next(companyId, DocType.PURCHASE_ORDER);
    let subtotal = new Decimal(0);
    for (const item of dto.items) {
      subtotal = subtotal.plus(new Decimal(item.qty).mul(item.unitCost));
    }

    const po = await this.prisma.purchaseOrder.create({
      data: {
        companyId, poNumber,
        supplierId: dto.supplierId,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        currencyCode: dto.currencyCode ?? 'USD',
        exchangeRate: dto.exchangeRate ?? 1,
        subtotal: subtotal.toFixed(4),
        total: subtotal.toFixed(4),
        notes: dto.notes,
        createdByUserId: userId,
        items: {
          create: dto.items.map((item) => ({
            materialId: item.materialId,
            description: item.description,
            qty: item.qty,
            unitCost: item.unitCost,
            lineTotal: new Decimal(item.qty).mul(item.unitCost).toFixed(4),
          })),
        },
      },
      include: { items: { include: { material: true } }, supplier: true },
    });

    await this.audit.log({ companyId, userId, action: 'procurement.po_create', entityType: 'PurchaseOrder', entityId: po.id });
    return po;
  }

  async findAllPOs(companyId: string, filter: PoFilterDto, pagination: PaginationDto) {
    const where: any = {
      companyId, deletedAt: null,
      ...(filter.supplierId && { supplierId: filter.supplierId }),
      ...(filter.status && { status: filter.status }),
      ...(filter.search && {
        OR: [
          { poNumber: { contains: filter.search, mode: 'insensitive' } },
          { supplier: { name: { contains: filter.search, mode: 'insensitive' } } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        include: { supplier: { select: { id: true, name: true, supplierNumber: true } }, _count: { select: { items: true, grns: true } } },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  async findOnePO(companyId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        supplier: true,
        items: { include: { material: { include: { category: true } } } },
        grns: { include: { items: true } },
      },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async sendPO(companyId: string, id: string, userId?: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(`PO is already ${po.status}`);
    }
    const updated = await this.prisma.purchaseOrder.update({ where: { id }, data: { status: PurchaseOrderStatus.SENT } });
    await this.audit.log({ companyId, userId, action: 'procurement.po_send', entityType: 'PurchaseOrder', entityId: id });
    return updated;
  }

  async cancelPO(companyId: string, id: string, userId?: string) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!po) throw new NotFoundException('Purchase order not found');
    const cancellable: PurchaseOrderStatus[] = [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SENT];
    if (!cancellable.includes(po.status)) {
      throw new BadRequestException(`Cannot cancel a PO in ${po.status} status`);
    }
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status: PurchaseOrderStatus.CANCELLED } });
  }

  // ── GRN ───────────────────────────────────────────────────────────────────

  async createGRN(companyId: string, dto: CreateGrnDto, userId?: string) {
    const grnNumber = await this.numbering.next(companyId, DocType.GRN);

    const grn = await this.prisma.$transaction(async (tx) => {
      const g = await tx.goodsReceivedNote.create({
        data: {
          companyId, grnNumber,
          poId: dto.poId,
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId,
          receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : new Date(),
          notes: dto.notes,
          receivedByUserId: userId,
          items: {
            create: dto.items.map((item) => ({
              poItemId: item.poItemId,
              materialId: item.materialId,
              qtyReceived: item.qtyReceived,
              qtyRejected: item.qtyRejected ?? 0,
              unitCost: item.unitCost,
            })),
          },
        },
        include: { items: true },
      });

      // Record stock movements for each received item
      for (const item of dto.items) {
        const qtyAccepted = new Decimal(item.qtyReceived).minus(item.qtyRejected ?? 0);
        if (qtyAccepted.greaterThan(0)) {
          await this.stock.recordMovement({
            companyId, materialId: item.materialId, warehouseId: dto.warehouseId,
            type: StockMovementType.GRN_RECEIPT,
            qty: qtyAccepted, unitCost: item.unitCost,
            refType: 'GRN', refId: g.id,
            note: `GRN ${grnNumber}`, userId, tx,
          });
        }

        // Update PO item qty received
        if (item.poItemId) {
          await tx.purchaseOrderItem.update({
            where: { id: item.poItemId },
            data: { qtyReceived: { increment: qtyAccepted.toNumber() } },
          });
        }
      }

      // Update PO status if exists
      if (dto.poId) {
        const poItems = await tx.purchaseOrderItem.findMany({ where: { poId: dto.poId } });
        const allReceived = poItems.every((i) => new Decimal(i.qtyReceived.toString()).gte(new Decimal(i.qty.toString())));
        const someReceived = poItems.some((i) => new Decimal(i.qtyReceived.toString()).gt(0));
        const newStatus = allReceived
          ? PurchaseOrderStatus.RECEIVED
          : someReceived ? PurchaseOrderStatus.PARTIALLY_RECEIVED : PurchaseOrderStatus.SENT;
        await tx.purchaseOrder.update({ where: { id: dto.poId }, data: { status: newStatus } });
      }

      return g;
    });

    await this.audit.log({ companyId, userId, action: 'procurement.grn_create', entityType: 'GoodsReceivedNote', entityId: grn.id });
    return grn;
  }

  async findAllGRNs(companyId: string, supplierId: string | undefined, pagination: PaginationDto) {
    const where = { companyId, ...(supplierId && { supplierId }) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.goodsReceivedNote.findMany({
        where,
        include: { supplier: { select: { id: true, name: true } }, _count: { select: { items: true } } },
        orderBy: { receivedDate: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.goodsReceivedNote.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  async findOneGRN(companyId: string, id: string) {
    const grn = await this.prisma.goodsReceivedNote.findFirst({
      where: { id, companyId },
      include: {
        supplier: true,
        po: { select: { id: true, poNumber: true } },
        items: { include: { material: { include: { category: true } } } },
      },
    });
    if (!grn) throw new NotFoundException('GRN not found');
    return grn;
  }

  // ── Supplier Invoices (Bills) ──────────────────────────────────────────────

  async createBill(companyId: string, dto: CreateSupplierInvoiceDto, userId?: string) {
    const internalNumber = await this.numbering.next(companyId, DocType.SUPPLIER_INVOICE);
    let subtotal = new Decimal(0);
    for (const item of dto.items) {
      subtotal = subtotal.plus(new Decimal(item.qty).mul(item.unitCost));
    }

    const bill = await this.prisma.supplierInvoice.create({
      data: {
        companyId, internalNumber,
        supplierId: dto.supplierId,
        grnId: dto.grnId,
        supplierRef: dto.supplierRef,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        currencyCode: dto.currencyCode ?? 'USD',
        exchangeRate: dto.exchangeRate ?? 1,
        subtotal: subtotal.toFixed(4),
        total: subtotal.toFixed(4),
        balance: subtotal.toFixed(4),
        notes: dto.notes,
        items: {
          create: dto.items.map((item) => ({
            description: item.description,
            qty: item.qty,
            unitCost: item.unitCost,
            lineTotal: new Decimal(item.qty).mul(item.unitCost).toFixed(4),
          })),
        },
      },
      include: { items: true, supplier: true },
    });

    await this.audit.log({ companyId, userId, action: 'procurement.bill_create', entityType: 'SupplierInvoice', entityId: bill.id });
    return bill;
  }

  async findAllBills(companyId: string, supplierId: string | undefined, pagination: PaginationDto) {
    const where = { companyId, deletedAt: null, ...(supplierId && { supplierId }) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplierInvoice.findMany({
        where,
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: { invoiceDate: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.supplierInvoice.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  // ── Supplier Payments ──────────────────────────────────────────────────────

  async createPayment(companyId: string, dto: CreateSupplierPaymentDto, userId?: string) {
    const paymentNumber = await this.numbering.next(companyId, DocType.SUPPLIER_PAYMENT);

    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.supplierPayment.create({
        data: {
          companyId, paymentNumber,
          supplierId: dto.supplierId,
          method: dto.method,
          amount: dto.amount,
          currencyCode: dto.currencyCode ?? 'USD',
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
          reference: dto.reference,
          notes: dto.notes,
          createdByUserId: userId,
          allocations: dto.allocations?.length
            ? {
                create: dto.allocations.map((a) => ({
                  supplierInvoiceId: a.supplierInvoiceId,
                  amount: a.amount,
                })),
              }
            : undefined,
        },
      });

      // Update amountPaid + balance on allocated invoices
      if (dto.allocations?.length) {
        for (const alloc of dto.allocations) {
          const inv = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: alloc.supplierInvoiceId } });
          const newPaid = new Decimal(inv.amountPaid.toString()).plus(alloc.amount);
          const newBalance = new Decimal(inv.total.toString()).minus(newPaid);
          const newStatus = newBalance.lessThanOrEqualTo(0)
            ? SupplierInvoiceStatus.PAID
            : SupplierInvoiceStatus.PARTIALLY_PAID;
          await tx.supplierInvoice.update({
            where: { id: alloc.supplierInvoiceId },
            data: { amountPaid: newPaid.toFixed(4), balance: newBalance.toFixed(4), status: newStatus },
          });
        }
      }

      return p;
    });

    await this.audit.log({ companyId, userId, action: 'procurement.payment_create', entityType: 'SupplierPayment', entityId: payment.id });
    return payment;
  }

  async findAllPayments(companyId: string, supplierId: string | undefined, pagination: PaginationDto) {
    const where = { companyId, ...(supplierId && { supplierId }) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplierPayment.findMany({
        where,
        include: { supplier: { select: { id: true, name: true } }, _count: { select: { allocations: true } } },
        orderBy: { paymentDate: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.supplierPayment.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }
}
