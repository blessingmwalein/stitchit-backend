import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../documents/numbering.service';
import { AuditService } from '../audit/audit.service';
import { StockService } from '../inventory/stock.service';
import { DocType, JobStatus, StageStatus, StockMovementType } from '@prisma/client';
import {
  CreateJobsFromOrderDto, UpdateJobDto, JobFilterDto,
  AssignStageDto, CompleteStageDto, LogStageEventDto, AddStageImageDto,
  PlanAllocationDto, IssueAllocationDto, RecordWasteDto,
} from './dto/production.dto';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import Decimal from 'decimal.js';

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
  ) {}

  // ── Jobs ───────────────────────────────────────────────────────────────────

  async createJobsFromOrder(companyId: string, dto: CreateJobsFromOrderDto, userId?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, companyId, deletedAt: null },
      include: { items: { orderBy: { lineNo: 'asc' } } },
    });
    if (!order) throw new NotFoundException('Order not found');

    const stageDefs = await this.prisma.productionStageDef.findMany({
      where: { companyId, isActive: true },
      orderBy: { sequence: 'asc' },
    });
    if (!stageDefs.length) throw new BadRequestException('No active production stage definitions found');

    const targetItems = dto.itemIds?.length
      ? order.items.filter((i) => dto.itemIds!.includes(i.id))
      : order.items;

    if (!targetItems.length) throw new BadRequestException('No matching order items');

    const jobs = await this.prisma.$transaction(async (tx) => {
      const created: any[] = [];
      for (const item of targetItems) {
        // Check no job exists for this item
        const existing = await tx.productionJob.findUnique({ where: { orderItemId: item.id } });
        if (existing) continue; // idempotent

        const jobNumber = await this.numbering.next(companyId, DocType.JOB, tx);

        const job = await tx.productionJob.create({
          data: {
            companyId,
            jobNumber,
            orderId: dto.orderId,
            orderItemId: item.id,
            status: JobStatus.PENDING,
            priority: order.priority,
            currentStageDefId: stageDefs[0].id,
            stages: {
              create: stageDefs.map((def) => ({
                stageDefId: def.id,
                sequence: def.sequence,
                status: StageStatus.PENDING,
              })),
            },
          },
          include: { stages: { include: { stageDef: true }, orderBy: { sequence: 'asc' } } },
        });

        created.push(job);
      }
      return created;
    });

    await this.audit.log({ companyId, userId, action: 'production.jobs_create', entityType: 'Order', entityId: dto.orderId, newValue: { jobCount: jobs.length } });
    return jobs;
  }

  async findAll(companyId: string, filter: JobFilterDto, pagination: PaginationDto) {
    const where: any = {
      companyId,
      ...(filter.status && { status: filter.status }),
      ...(filter.priority && { priority: filter.priority }),
      ...(filter.assignedManagerUserId && { assignedManagerUserId: filter.assignedManagerUserId }),
      ...(filter.orderId && { orderId: filter.orderId }),
      ...(filter.dateFrom || filter.dateTo) && {
        scheduledStart: {
          ...(filter.dateFrom && { gte: new Date(filter.dateFrom) }),
          ...(filter.dateTo && { lte: new Date(filter.dateTo) }),
        },
      },
      ...(filter.search && {
        OR: [
          { jobNumber: { contains: filter.search, mode: 'insensitive' } },
          { order: { orderNumber: { contains: filter.search, mode: 'insensitive' } } },
          { order: { customer: { firstName: { contains: filter.search, mode: 'insensitive' } } } },
          { order: { customer: { companyName: { contains: filter.search, mode: 'insensitive' } } } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.productionJob.findMany({
        where,
        include: {
          order: {
            select: {
              id: true, orderNumber: true, promisedDate: true,
              customer: { select: { id: true, firstName: true, lastName: true, companyName: true } },
            },
          },
          orderItem: { select: { id: true, rugName: true, widthCm: true, heightCm: true, complexity: true } },
          stages: {
            where: { status: { in: [StageStatus.IN_PROGRESS, StageStatus.PENDING] } },
            include: { stageDef: { select: { id: true, name: true, sequence: true } } },
            orderBy: { sequence: 'asc' },
            take: 1,
          },
          _count: { select: { stages: true } },
        },
        orderBy: [{ priority: 'desc' }, { scheduledStart: 'asc' }, { createdAt: 'asc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.productionJob.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  async kanban(companyId: string) {
    const stageDefs = await this.prisma.productionStageDef.findMany({
      where: { companyId, isActive: true },
      orderBy: { sequence: 'asc' },
    });

    const jobs = await this.prisma.productionJob.findMany({
      where: {
        companyId,
        status: { in: [JobStatus.PENDING, JobStatus.IN_PROGRESS, JobStatus.ON_HOLD] },
      },
      include: {
        order: {
          select: {
            orderNumber: true, promisedDate: true,
            customer: { select: { firstName: true, lastName: true, companyName: true } },
          },
        },
        orderItem: { select: { rugName: true, widthCm: true, heightCm: true } },
        stages: {
          where: { status: { in: [StageStatus.IN_PROGRESS, StageStatus.PENDING] } },
          include: { stageDef: { select: { id: true, name: true, sequence: true } } },
          orderBy: { sequence: 'asc' },
          take: 1,
        },
      },
      orderBy: [{ priority: 'desc' }, { scheduledStart: 'asc' }],
    });

    const columns: Record<string, typeof jobs> = {};
    for (const def of stageDefs) columns[def.id] = [];
    columns['__unstarted'] = [];

    for (const job of jobs) {
      const key = job.currentStageDefId ?? '__unstarted';
      if (columns[key]) columns[key].push(job);
      else columns['__unstarted'].push(job);
    }

    return {
      stageDefs,
      columns,
    };
  }

  async findOne(companyId: string, id: string) {
    const job = await this.prisma.productionJob.findFirst({
      where: { id, companyId },
      include: {
        order: { include: { customer: true } },
        orderItem: true,
        stages: {
          include: {
            stageDef: true,
            assignedTo: { select: { id: true, firstName: true, lastName: true } },
            images: true,
            logs: { orderBy: { createdAt: 'asc' } },
          },
          orderBy: { sequence: 'asc' },
        },
        allocations: { include: { material: { include: { category: true } } } },
        costSheet: true,
      },
    });
    if (!job) throw new NotFoundException('Production job not found');
    return job;
  }

  async update(companyId: string, id: string, dto: UpdateJobDto, userId?: string) {
    const job = await this.prisma.productionJob.findFirst({ where: { id, companyId } });
    if (!job) throw new NotFoundException('Production job not found');

    return this.prisma.productionJob.update({
      where: { id },
      data: {
        ...(dto.assignedManagerUserId !== undefined && { assignedManagerUserId: dto.assignedManagerUserId }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.scheduledStart !== undefined && { scheduledStart: new Date(dto.scheduledStart) }),
        ...(dto.scheduledEnd !== undefined && { scheduledEnd: new Date(dto.scheduledEnd) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async startJob(companyId: string, id: string, userId?: string) {
    const job = await this.prisma.productionJob.findFirst({ where: { id, companyId } });
    if (!job) throw new NotFoundException('Production job not found');
    if (job.status !== JobStatus.PENDING && job.status !== JobStatus.ON_HOLD) {
      throw new BadRequestException(`Job is ${job.status} — can only start PENDING or ON_HOLD jobs`);
    }

    return this.prisma.productionJob.update({
      where: { id },
      data: { status: JobStatus.IN_PROGRESS, actualStart: job.actualStart ?? new Date() },
    });
  }

  async holdJob(companyId: string, id: string, note?: string, userId?: string) {
    const job = await this.prisma.productionJob.findFirst({ where: { id, companyId } });
    if (!job) throw new NotFoundException('Production job not found');

    return this.prisma.productionJob.update({
      where: { id },
      data: {
        status: JobStatus.ON_HOLD,
        ...(note && { notes: [job.notes, `[ON HOLD] ${note}`].filter(Boolean).join('\n') }),
      },
    });
  }

  async cancelJob(companyId: string, id: string, userId?: string) {
    const job = await this.prisma.productionJob.findFirst({ where: { id, companyId } });
    if (!job) throw new NotFoundException('Production job not found');
    if (job.status === JobStatus.COMPLETED) throw new BadRequestException('Cannot cancel a completed job');

    return this.prisma.productionJob.update({ where: { id }, data: { status: JobStatus.CANCELLED } });
  }

  // ── Stage operations ───────────────────────────────────────────────────────

  private async getStage(companyId: string, jobId: string, stageId: string) {
    const stage = await this.prisma.jobStage.findFirst({
      where: { id: stageId, jobId },
      include: { job: { select: { companyId: true, id: true } }, stageDef: true },
    });
    if (!stage || stage.job.companyId !== companyId) throw new NotFoundException('Stage not found');
    return stage;
  }

  async startStage(companyId: string, jobId: string, stageId: string, userId?: string) {
    const stage = await this.getStage(companyId, jobId, stageId);
    if (stage.status !== StageStatus.PENDING) {
      throw new BadRequestException(`Stage is ${stage.status}`);
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.jobStage.update({
        where: { id: stageId },
        data: { status: StageStatus.IN_PROGRESS, startedAt: new Date() },
      }),
      this.prisma.jobStageLog.create({
        data: { jobStageId: stageId, event: 'START', userId, note: `Stage started` },
      }),
      this.prisma.productionJob.update({
        where: { id: jobId },
        data: { currentStageDefId: stage.stageDefId, status: JobStatus.IN_PROGRESS, actualStart: new Date() },
      }),
    ]);
    return updated;
  }

  async completeStage(companyId: string, jobId: string, stageId: string, dto: CompleteStageDto, userId?: string) {
    const stage = await this.getStage(companyId, jobId, stageId);
    if (stage.status !== StageStatus.IN_PROGRESS) {
      throw new BadRequestException(`Stage must be IN_PROGRESS to complete`);
    }

    const now = new Date();
    const timeSpent = dto.timeSpentMinutes ?? (
      stage.startedAt ? Math.round((now.getTime() - stage.startedAt.getTime()) / 60000) : 0
    );

    const updated = await this.prisma.jobStage.update({
      where: { id: stageId },
      data: {
        status: StageStatus.COMPLETED,
        endedAt: now,
        timeSpentMinutes: timeSpent,
        notes: dto.notes,
      },
    });

    await this.prisma.jobStageLog.create({
      data: { jobStageId: stageId, event: 'COMPLETE', userId, note: dto.notes },
    });

    // Advance job to next pending stage or complete job
    await this.advanceJob(companyId, jobId, stage.stageDef.sequence, userId);
    return updated;
  }

  private async advanceJob(companyId: string, jobId: string, completedSequence: number, userId?: string) {
    const allStages = await this.prisma.jobStage.findMany({
      where: { jobId },
      include: { stageDef: true },
      orderBy: { sequence: 'asc' },
    });

    const nextStage = allStages.find(
      (s) => s.stageDef.sequence > completedSequence && s.status === StageStatus.PENDING,
    );

    if (nextStage) {
      await this.prisma.productionJob.update({
        where: { id: jobId },
        data: { currentStageDefId: nextStage.stageDefId },
      });
    } else {
      // All stages done
      const allDone = allStages.every((s) =>
        ([StageStatus.COMPLETED, StageStatus.SKIPPED] as StageStatus[]).includes(s.status),
      );
      if (allDone) {
        await this.prisma.productionJob.update({
          where: { id: jobId },
          data: { status: JobStatus.COMPLETED, actualEnd: new Date() },
        });
        // Check if all jobs for the order are done → advance order to QUALITY_CHECK
        const job = await this.prisma.productionJob.findUnique({ where: { id: jobId } });
        if (job) {
          const orderJobs = await this.prisma.productionJob.findMany({ where: { orderId: job.orderId } });
          const allJobsDone = orderJobs.every((j) => j.status === JobStatus.COMPLETED);
          if (allJobsDone) {
            await this.prisma.order.update({
              where: { id: job.orderId },
              data: {
                status: 'QUALITY_CHECK',
                statusHistory: {
                  create: { fromStatus: 'IN_PRODUCTION', toStatus: 'QUALITY_CHECK', changedByUserId: userId, note: 'All production jobs completed' },
                },
              },
            });
          }
        }
      }
    }
  }

  async failStage(companyId: string, jobId: string, stageId: string, note: string, userId?: string) {
    const stage = await this.getStage(companyId, jobId, stageId);

    await this.prisma.jobStage.update({
      where: { id: stageId },
      data: { status: StageStatus.FAILED, endedAt: new Date() },
    });

    await this.prisma.jobStageLog.create({
      data: { jobStageId: stageId, event: 'FAIL', userId, note },
    });

    await this.prisma.productionJob.update({
      where: { id: jobId },
      data: { status: JobStatus.QC_FAILED },
    });
  }

  async assignStage(companyId: string, jobId: string, stageId: string, dto: AssignStageDto, userId?: string) {
    await this.getStage(companyId, jobId, stageId);
    const updated = await this.prisma.jobStage.update({
      where: { id: stageId },
      data: { assignedToUserId: dto.userId },
    });
    await this.prisma.jobStageLog.create({
      data: { jobStageId: stageId, event: 'REASSIGN', userId, note: `Assigned to user ${dto.userId}` },
    });
    return updated;
  }

  async addLog(companyId: string, jobId: string, stageId: string, dto: LogStageEventDto, userId?: string) {
    await this.getStage(companyId, jobId, stageId);
    return this.prisma.jobStageLog.create({
      data: { jobStageId: stageId, event: dto.event, userId, note: dto.note },
    });
  }

  async addImage(companyId: string, jobId: string, stageId: string, dto: AddStageImageDto, userId?: string) {
    await this.getStage(companyId, jobId, stageId);
    const file = await this.prisma.fileObject.findFirst({ where: { id: dto.fileId, companyId } });
    if (!file) throw new NotFoundException('File not found');

    return this.prisma.jobStageImage.create({
      data: { jobStageId: stageId, fileId: dto.fileId, caption: dto.caption },
    });
  }

  async getImages(companyId: string, jobId: string, stageId: string) {
    await this.getStage(companyId, jobId, stageId);
    return this.prisma.jobStageImage.findMany({ where: { jobStageId: stageId } });
  }

  // ── Material Allocation ────────────────────────────────────────────────────

  async planAllocation(companyId: string, jobId: string, dto: PlanAllocationDto, userId?: string) {
    const job = await this.prisma.productionJob.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException('Production job not found');

    const material = await this.prisma.material.findFirst({ where: { id: dto.materialId, companyId, deletedAt: null } });
    if (!material) throw new NotFoundException('Material not found');

    const plannedCost = new Decimal(dto.plannedQty).mul(material.avgCost).toDecimalPlaces(4);

    return this.prisma.materialAllocation.upsert({
      where: { jobId_materialId: { jobId, materialId: dto.materialId } },
      create: {
        jobId,
        materialId: dto.materialId,
        plannedQty: dto.plannedQty,
        plannedCost: plannedCost.toString(),
      },
      update: {
        plannedQty: dto.plannedQty,
        plannedCost: plannedCost.toString(),
      },
      include: { material: true },
    });
  }

  async issueToProduction(companyId: string, jobId: string, dto: IssueAllocationDto, userId?: string) {
    const job = await this.prisma.productionJob.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException('Production job not found');

    const material = await this.prisma.material.findFirst({ where: { id: dto.materialId, companyId } });
    if (!material) throw new NotFoundException('Material not found');

    const movement = await this.stock.recordMovement({
      companyId,
      materialId: dto.materialId,
      warehouseId: dto.warehouseId,
      type: StockMovementType.ISSUE_TO_PRODUCTION,
      qty: -dto.qty, // negative = out
      refType: 'ProductionJob',
      refId: jobId,
      note: dto.note ?? `Issue to job ${job.jobNumber}`,
      userId,
    });

    const issueCost = new Decimal(dto.qty).mul(material.avgCost).toDecimalPlaces(4);

    await this.prisma.materialAllocation.upsert({
      where: { jobId_materialId: { jobId, materialId: dto.materialId } },
      create: {
        jobId, materialId: dto.materialId,
        plannedQty: dto.qty, plannedCost: issueCost.toString(),
        actualQtyIssued: dto.qty, actualCost: issueCost.toString(),
      },
      update: {
        actualQtyIssued: { increment: dto.qty },
        actualCost: { increment: issueCost.toNumber() },
      },
    });

    return movement;
  }

  async recordWaste(companyId: string, jobId: string, dto: RecordWasteDto, userId?: string) {
    const job = await this.prisma.productionJob.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException('Production job not found');

    const material = await this.prisma.material.findFirst({ where: { id: dto.materialId, companyId } });
    if (!material) throw new NotFoundException('Material not found');

    const movement = await this.stock.recordMovement({
      companyId,
      materialId: dto.materialId,
      warehouseId: dto.warehouseId,
      type: StockMovementType.WASTE,
      qty: -dto.wasteQty,
      refType: 'ProductionJob',
      refId: jobId,
      note: dto.note ?? `Waste from job ${job.jobNumber}`,
      userId,
    });

    const wasteCost = new Decimal(dto.wasteQty).mul(material.avgCost).toDecimalPlaces(4);

    await this.prisma.materialAllocation.upsert({
      where: { jobId_materialId: { jobId, materialId: dto.materialId } },
      create: {
        jobId, materialId: dto.materialId,
        plannedQty: 0, plannedCost: '0',
        wasteQty: dto.wasteQty, wasteCost: wasteCost.toString(),
      },
      update: {
        wasteQty: { increment: dto.wasteQty },
        wasteCost: { increment: wasteCost.toNumber() },
      },
    });

    return movement;
  }

  async getAllocations(companyId: string, jobId: string) {
    const job = await this.prisma.productionJob.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException('Production job not found');

    return this.prisma.materialAllocation.findMany({
      where: { jobId },
      include: { material: { include: { category: true } } },
    });
  }
}
