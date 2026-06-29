import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCostSheetDto } from './dto/costing.dto';
import Decimal from 'decimal.js';

@Injectable()
export class JobCostService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.jobCostSheet.findMany({
      where: { job: { companyId } },
      include: {
        job: {
          select: {
            id: true, jobNumber: true, status: true,
            order: { select: { orderNumber: true, customer: { select: { firstName: true, lastName: true, companyName: true } } } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(companyId: string, jobId: string) {
    const sheet = await this.prisma.jobCostSheet.findFirst({
      where: { jobId, job: { companyId } },
      include: {
        job: {
          include: {
            allocations: { include: { material: { select: { name: true, sku: true, uom: true } } } },
            stages: { include: { stageDef: true } },
          },
        },
      },
    });
    if (!sheet) throw new NotFoundException('Cost sheet not found');
    return sheet;
  }

  async getOrCreate(companyId: string, jobId: string) {
    const job = await this.prisma.productionJob.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException('Production job not found');

    return this.prisma.jobCostSheet.upsert({
      where: { jobId },
      create: { jobId },
      update: {},
    });
  }

  async update(companyId: string, jobId: string, dto: UpdateCostSheetDto) {
    await this.getOrCreate(companyId, jobId);

    const data: any = {};
    if (dto.plannedMaterialCost !== undefined) data.plannedMaterialCost = dto.plannedMaterialCost.toString();
    if (dto.plannedLabourCost !== undefined) data.plannedLabourCost = dto.plannedLabourCost.toString();
    if (dto.plannedOverhead !== undefined) data.plannedOverhead = dto.plannedOverhead.toString();
    if (dto.packagingCost !== undefined) data.packagingCost = dto.packagingCost.toString();
    if (dto.deliveryCost !== undefined) data.deliveryCost = dto.deliveryCost.toString();

    // Recalculate planned total
    const sheet = await this.prisma.jobCostSheet.findUnique({ where: { jobId } });
    if (sheet) {
      const planned = new Decimal(data.plannedMaterialCost ?? sheet.plannedMaterialCost.toString())
        .plus(data.plannedLabourCost ?? sheet.plannedLabourCost.toString())
        .plus(data.plannedOverhead ?? sheet.plannedOverhead.toString())
        .plus(data.packagingCost ?? sheet.packagingCost.toString())
        .plus(data.deliveryCost ?? sheet.deliveryCost.toString());
      data.totalPlannedCost = planned.toString();
    }

    if (dto.sellingPrice !== undefined) {
      data.sellingPrice = dto.sellingPrice.toString();
      const sp = new Decimal(dto.sellingPrice);
      const tc = new Decimal(data.totalPlannedCost ?? sheet?.totalPlannedCost?.toString() ?? '0');
      if (sp.gt(0)) {
        data.plannedMarginPct = sp.minus(tc).div(sp).mul(100).toDecimalPlaces(4).toString();
      }
    }

    return this.prisma.jobCostSheet.update({ where: { jobId }, data });
  }

  /** Pull actual costs from MaterialAllocations and recalculate the sheet */
  async recalculate(companyId: string, jobId: string) {
    await this.getOrCreate(companyId, jobId);

    // Actual material cost = sum of actualQtyIssued × unitCost from allocations
    const allocations = await this.prisma.materialAllocation.findMany({
      where: { jobId },
      include: { material: { select: { avgCost: true } } },
    });

    const actualMaterialCost = allocations.reduce((sum, a) => {
      const issued = new Decimal(a.actualQtyIssued?.toString() ?? '0');
      const cost = new Decimal(a.material.avgCost?.toString() ?? '0');
      return sum.plus(issued.mul(cost));
    }, new Decimal(0));

    const wasteCost = allocations.reduce(
      (sum, a) => sum.plus(new Decimal(a.wasteCost?.toString() ?? '0')),
      new Decimal(0),
    );

    const sheet = await this.prisma.jobCostSheet.findUnique({ where: { jobId } });
    const actualLabourCost = new Decimal(sheet?.actualLabourCost?.toString() ?? '0');
    const actualOverhead = new Decimal(sheet?.actualOverhead?.toString() ?? '0');
    const packagingCost = new Decimal(sheet?.packagingCost?.toString() ?? '0');
    const deliveryCost = new Decimal(sheet?.deliveryCost?.toString() ?? '0');

    const totalActualCost = actualMaterialCost
      .plus(actualLabourCost)
      .plus(actualOverhead)
      .plus(wasteCost)
      .plus(packagingCost)
      .plus(deliveryCost);

    const sellingPrice = new Decimal(sheet?.sellingPrice?.toString() ?? '0');
    const actualMarginPct = sellingPrice.gt(0)
      ? sellingPrice.minus(totalActualCost).div(sellingPrice).mul(100)
      : new Decimal(0);

    return this.prisma.jobCostSheet.update({
      where: { jobId },
      data: {
        actualMaterialCost: actualMaterialCost.toDecimalPlaces(4).toString(),
        wasteCost: wasteCost.toDecimalPlaces(4).toString(),
        totalActualCost: totalActualCost.toDecimalPlaces(4).toString(),
        actualMarginPct: actualMarginPct.toDecimalPlaces(4).toString(),
      },
    });
  }
}
