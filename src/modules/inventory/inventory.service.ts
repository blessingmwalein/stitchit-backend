import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../documents/numbering.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from './stock.service';
import { DocType, StockMovementType } from '@prisma/client';
import {
  CreateCategoryDto, CreateWarehouseDto, UpdateWarehouseDto,
  CreateMaterialDto, UpdateMaterialDto, MaterialFilterDto,
  StockAdjustmentDto, MovementFilterDto,
} from './dto/inventory.dto';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
  ) {}

  // ── Categories ─────────────────────────────────────────────────────────────

  async createCategory(companyId: string, dto: CreateCategoryDto) {
    return this.prisma.materialCategory.create({ data: { companyId, name: dto.name } });
  }

  async listCategories(companyId: string) {
    return this.prisma.materialCategory.findMany({
      where: { companyId },
      include: { _count: { select: { materials: true } } },
      orderBy: { name: 'asc' },
    });
  }

  // ── Warehouses ──────────────────────────────────────────────────────────────

  async createWarehouse(companyId: string, dto: CreateWarehouseDto) {
    return this.prisma.warehouse.create({
      data: { companyId, name: dto.name, branchId: dto.branchId, isDefault: dto.isDefault ?? false },
    });
  }

  async listWarehouses(companyId: string) {
    return this.prisma.warehouse.findMany({
      where: { companyId, isActive: true },
      include: { _count: { select: { stockLevels: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async updateWarehouse(companyId: string, id: string, dto: UpdateWarehouseDto) {
    const w = await this.prisma.warehouse.findFirst({ where: { id, companyId } });
    if (!w) throw new NotFoundException('Warehouse not found');
    return this.prisma.warehouse.update({ where: { id }, data: dto });
  }

  // ── Materials ──────────────────────────────────────────────────────────────

  async createMaterial(companyId: string, dto: CreateMaterialDto, userId?: string) {
    const exists = await this.prisma.material.findFirst({ where: { companyId, sku: dto.sku, deletedAt: null } });
    if (exists) throw new ConflictException(`Material with SKU "${dto.sku}" already exists`);

    const material = await this.prisma.material.create({
      data: {
        companyId,
        sku: dto.sku,
        name: dto.name,
        categoryId: dto.categoryId,
        uom: dto.uom,
        color: dto.color,
        reorderLevel: dto.reorderLevel ?? 0,
        reorderQty: dto.reorderQty ?? 0,
      },
      include: { category: true },
    });

    await this.audit.log({ companyId, userId, action: 'inventory.material_create', entityType: 'Material', entityId: material.id });
    return material;
  }

  async findAllMaterials(companyId: string, filter: MaterialFilterDto, pagination: PaginationDto) {
    const where: any = {
      companyId,
      deletedAt: null,
      ...(filter.categoryId && { categoryId: filter.categoryId }),
      ...(filter.isActive !== undefined && { isActive: filter.isActive }),
      ...(filter.search && {
        OR: [
          { sku: { contains: filter.search, mode: 'insensitive' } },
          { name: { contains: filter.search, mode: 'insensitive' } },
          { color: { contains: filter.search, mode: 'insensitive' } },
        ],
      }),
    };

    let materials = await this.prisma.material.findMany({
      where,
      include: {
        category: true,
        stockLevels: { include: { warehouse: { select: { id: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
      skip: pagination.skip,
      take: pagination.take,
    });

    if (filter.belowReorder) {
      materials = materials.filter((m) => {
        const totalOnHand = m.stockLevels.reduce((s, sl) => s + Number(sl.qtyOnHand), 0);
        return Number(m.reorderLevel) > 0 && totalOnHand <= Number(m.reorderLevel);
      });
    }

    const total = await this.prisma.material.count({ where });
    return paginate(materials, total, pagination);
  }

  async findOneMaterial(companyId: string, id: string) {
    const m = await this.prisma.material.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        category: true,
        stockLevels: { include: { warehouse: true } },
        _count: { select: { movements: true, allocations: true } },
      },
    });
    if (!m) throw new NotFoundException('Material not found');
    return m;
  }

  async updateMaterial(companyId: string, id: string, dto: UpdateMaterialDto, userId?: string) {
    const m = await this.prisma.material.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!m) throw new NotFoundException('Material not found');

    const updated = await this.prisma.material.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.uom !== undefined && { uom: dto.uom }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.reorderLevel !== undefined && { reorderLevel: dto.reorderLevel }),
        ...(dto.reorderQty !== undefined && { reorderQty: dto.reorderQty }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: { category: true },
    });

    await this.audit.log({ companyId, userId, action: 'inventory.material_update', entityType: 'Material', entityId: id });
    return updated;
  }

  async deleteMaterial(companyId: string, id: string, userId?: string) {
    const m = await this.prisma.material.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!m) throw new NotFoundException('Material not found');
    await this.prisma.material.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ companyId, userId, action: 'inventory.material_delete', entityType: 'Material', entityId: id });
  }

  // ── Stock Adjustments ──────────────────────────────────────────────────────

  async adjust(companyId: string, dto: StockAdjustmentDto, userId?: string) {
    const type = Number(dto.qty) >= 0 ? StockMovementType.ADJUSTMENT_IN : StockMovementType.ADJUSTMENT_OUT;
    const movement = await this.stock.recordMovement({
      companyId, materialId: dto.materialId, warehouseId: dto.warehouseId,
      type, qty: dto.qty, unitCost: dto.unitCost,
      refType: 'Adjustment', note: dto.note, userId,
    });

    await this.audit.log({ companyId, userId, action: 'inventory.adjustment', entityType: 'Material', entityId: dto.materialId, newValue: { qty: dto.qty } });
    return movement;
  }

  // ── Movements ──────────────────────────────────────────────────────────────

  async findMovements(companyId: string, filter: MovementFilterDto, pagination: PaginationDto) {
    const where: any = {
      companyId,
      ...(filter.materialId && { materialId: filter.materialId }),
      ...(filter.warehouseId && { warehouseId: filter.warehouseId }),
      ...(filter.type && { type: filter.type }),
      ...(filter.dateFrom || filter.dateTo) && {
        movementDate: {
          ...(filter.dateFrom && { gte: new Date(filter.dateFrom) }),
          ...(filter.dateTo && { lte: new Date(filter.dateTo) }),
        },
      },
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: {
          material: { select: { id: true, sku: true, name: true, uom: true } },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: { movementDate: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  // ── Valuation ─────────────────────────────────────────────────────────────

  async valuation(companyId: string) {
    const levels = await this.stock.bulkStockLevels(companyId);
    let totalValue = 0;
    const rows = levels.map((l) => {
      const qty = Number(l.qtyOnHand);
      const cost = Number(l.material.avgCost);
      const value = qty * cost;
      totalValue += value;
      return { ...l, value };
    });
    return { rows, totalValue };
  }

  // ── Reorder Alerts ────────────────────────────────────────────────────────

  reorderAlerts(companyId: string) {
    return this.stock.reorderAlerts(companyId);
  }
}
