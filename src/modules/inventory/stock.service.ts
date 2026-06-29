import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StockMovementType, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

export interface RecordMovementOpts {
  companyId: string;
  materialId: string;
  warehouseId: string;
  type: StockMovementType;
  qty: number | Decimal; // positive = in, negative = out
  unitCost?: number | Decimal;
  refType?: string;
  refId?: string;
  note?: string;
  userId?: string;
  tx?: Prisma.TransactionClient;
}

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Core movement recorder — updates StockLevel + Material.avgCost atomically.
   * For receipts (positive qty): recalculates moving-weighted-average.
   * For issues/adjustments (negative qty): uses current avgCost, does NOT change avgCost.
   */
  async recordMovement(opts: RecordMovementOpts) {
    const execute = async (tx: Prisma.TransactionClient) => {
      const qty = new Decimal(opts.qty.toString());
      const isReceipt = qty.greaterThan(0);

      // Lock material row for avgCost recalculation
      const material = await tx.material.findUniqueOrThrow({ where: { id: opts.materialId } });

      let unitCost = opts.unitCost ? new Decimal(opts.unitCost.toString()) : new Decimal(material.avgCost.toString());

      // Moving weighted average on receipt
      if (isReceipt && opts.unitCost) {
        const existingLevel = await tx.stockLevel.findUnique({
          where: { materialId_warehouseId: { materialId: opts.materialId, warehouseId: opts.warehouseId } },
        });
        const existingQty = new Decimal((existingLevel?.qtyOnHand ?? '0').toString());
        const existingCost = new Decimal(material.avgCost.toString());

        if (existingQty.greaterThan(0)) {
          const newAvg = existingQty.mul(existingCost).plus(qty.mul(unitCost))
            .div(existingQty.plus(qty));
          await tx.material.update({
            where: { id: opts.materialId },
            data: { avgCost: newAvg.toDecimalPlaces(6).toString() },
          });
        } else {
          await tx.material.update({
            where: { id: opts.materialId },
            data: { avgCost: unitCost.toDecimalPlaces(6).toString() },
          });
        }
      } else if (!isReceipt) {
        // For issues, cost = current avgCost
        unitCost = new Decimal(material.avgCost.toString());
      }

      const totalCost = qty.abs().mul(unitCost).toDecimalPlaces(4);

      // Upsert StockLevel
      await tx.stockLevel.upsert({
        where: { materialId_warehouseId: { materialId: opts.materialId, warehouseId: opts.warehouseId } },
        create: {
          materialId: opts.materialId,
          warehouseId: opts.warehouseId,
          qtyOnHand: qty.toString(),
        },
        update: { qtyOnHand: { increment: qty.toNumber() } },
      });

      // Record movement
      const movement = await tx.stockMovement.create({
        data: {
          companyId: opts.companyId,
          materialId: opts.materialId,
          warehouseId: opts.warehouseId,
          type: opts.type,
          qty: qty.toString(),
          unitCost: unitCost.toString(),
          totalCost: totalCost.toString(),
          refType: opts.refType,
          refId: opts.refId,
          note: opts.note,
          createdByUserId: opts.userId,
        },
      });

      return movement;
    };

    if (opts.tx) return execute(opts.tx);
    return this.prisma.$transaction(execute);
  }

  async getStockLevel(materialId: string, warehouseId: string) {
    return this.prisma.stockLevel.findUnique({
      where: { materialId_warehouseId: { materialId, warehouseId } },
    });
  }

  async bulkStockLevels(companyId: string, warehouseId?: string) {
    return this.prisma.stockLevel.findMany({
      where: {
        material: { companyId },
        ...(warehouseId && { warehouseId }),
      },
      include: {
        material: { include: { category: true } },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { material: { name: 'asc' } },
    });
  }

  async reorderAlerts(companyId: string) {
    const levels = await this.prisma.stockLevel.findMany({
      where: { material: { companyId, isActive: true } },
      include: { material: { include: { category: true } }, warehouse: { select: { id: true, name: true } } },
    });

    return levels.filter((l) => {
      const onHand = new Decimal(l.qtyOnHand.toString());
      const reorder = new Decimal(l.material.reorderLevel.toString());
      return reorder.greaterThan(0) && onHand.lessThanOrEqualTo(reorder);
    });
  }
}
