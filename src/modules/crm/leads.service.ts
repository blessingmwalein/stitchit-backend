import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../documents/numbering.service';
import { AuditService } from '../audit/audit.service';
import { DocType, LeadStage, CustomerType } from '@prisma/client';
import {
  CreateLeadDto,
  UpdateLeadDto,
  ChangeLeadStageDto,
  ConvertLeadDto,
  LeadFilterDto,
} from './dto/crm.dto';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';

const VALID_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  NEW_LEAD: ['CONTACTED', 'LOST'],
  CONTACTED: ['DESIGN_DISCUSSION', 'LOST'],
  DESIGN_DISCUSSION: ['QUOTATION_SENT', 'LOST'],
  QUOTATION_SENT: ['NEGOTIATION', 'DEPOSIT_RECEIVED', 'LOST'],
  NEGOTIATION: ['DEPOSIT_RECEIVED', 'QUOTATION_SENT', 'LOST'],
  DEPOSIT_RECEIVED: ['PRODUCTION'],
  PRODUCTION: ['DELIVERED'],
  DELIVERED: [],
  LOST: [],
};

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly audit: AuditService,
  ) {}

  async create(companyId: string, dto: CreateLeadDto, userId?: string) {
    const leadNumber = await this.numbering.next(companyId, DocType.LEAD);

    const lead = await this.prisma.lead.create({
      data: {
        companyId,
        leadNumber,
        name: dto.name,
        companyName: dto.companyName,
        email: dto.email,
        phone: dto.phone,
        whatsappNumber: dto.whatsappNumber,
        source: dto.source,
        stage: dto.stage ?? LeadStage.NEW_LEAD,
        estimatedValue: dto.estimatedValue,
        requirements: dto.requirements,
        notes: dto.notes,
        assignedToUserId: dto.assignedToUserId,
        stageHistory: {
          create: {
            toStage: dto.stage ?? LeadStage.NEW_LEAD,
            changedByUserId: userId,
          },
        },
      },
      include: { stageHistory: true, assignedTo: { select: { id: true, firstName: true, lastName: true } } },
    });

    await this.audit.log({ companyId, userId, action: 'leads.create', entityType: 'Lead', entityId: lead.id, newValue: lead });
    return lead;
  }

  async findAll(companyId: string, filter: LeadFilterDto, pagination: PaginationDto) {
    const where = {
      companyId,
      deletedAt: null,
      ...(filter.stage && { stage: filter.stage }),
      ...(filter.source && { source: filter.source }),
      ...(filter.assignedToUserId && { assignedToUserId: filter.assignedToUserId }),
      ...(filter.search && {
        OR: [
          { name: { contains: filter.search, mode: 'insensitive' as const } },
          { email: { contains: filter.search, mode: 'insensitive' as const } },
          { phone: { contains: filter.search, mode: 'insensitive' as const } },
          { companyName: { contains: filter.search, mode: 'insensitive' as const } },
          { leadNumber: { contains: filter.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
          customer: { select: { id: true, customerNumber: true } },
          _count: { select: { followUps: true, communications: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return paginate(data, total, pagination);
  }

  async kanban(companyId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { companyId, deletedAt: null, stage: { not: LeadStage.LOST } },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { followUps: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const columns: Record<string, typeof leads> = {};
    const stages = Object.values(LeadStage).filter((s) => s !== LeadStage.LOST);
    for (const s of stages) columns[s] = [];
    for (const lead of leads) columns[lead.stage]?.push(lead);

    return columns;
  }

  async findOne(companyId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        customer: true,
        stageHistory: { orderBy: { createdAt: 'asc' } },
        followUps: { where: { status: 'PENDING' }, orderBy: { dueAt: 'asc' }, take: 5 },
        communications: { orderBy: { createdAt: 'desc' }, take: 10 },
        quotations: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async update(companyId: string, id: string, dto: UpdateLeadDto, userId?: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lead) throw new NotFoundException('Lead not found');

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.companyName !== undefined && { companyName: dto.companyName }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.whatsappNumber !== undefined && { whatsappNumber: dto.whatsappNumber }),
        ...(dto.source !== undefined && { source: dto.source }),
        ...(dto.estimatedValue !== undefined && { estimatedValue: dto.estimatedValue }),
        ...(dto.requirements !== undefined && { requirements: dto.requirements }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.lostReason !== undefined && { lostReason: dto.lostReason }),
        ...(dto.assignedToUserId !== undefined && { assignedToUserId: dto.assignedToUserId }),
      },
    });

    await this.audit.log({ companyId, userId, action: 'leads.update', entityType: 'Lead', entityId: id, oldValue: lead, newValue: updated });
    return updated;
  }

  async changeStage(companyId: string, id: string, dto: ChangeLeadStageDto, userId?: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lead) throw new NotFoundException('Lead not found');

    const allowed = VALID_TRANSITIONS[lead.stage];
    if (!allowed.includes(dto.stage)) {
      throw new BadRequestException(
        `Cannot transition from ${lead.stage} to ${dto.stage}. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        stage: dto.stage,
        ...(dto.stage === LeadStage.LOST && dto.note && { lostReason: dto.note }),
        stageHistory: {
          create: {
            fromStage: lead.stage,
            toStage: dto.stage,
            changedByUserId: userId,
            note: dto.note,
          },
        },
      },
      include: { stageHistory: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });

    await this.audit.log({ companyId, userId, action: 'leads.stage_change', entityType: 'Lead', entityId: id, oldValue: { stage: lead.stage }, newValue: { stage: dto.stage } });
    return updated;
  }

  async convertToCustomer(companyId: string, id: string, dto: ConvertLeadDto, userId?: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.customerId) throw new ConflictException('Lead already converted to a customer');

    const customerNumber = await this.numbering.next(companyId, DocType.CUSTOMER);
    const type = dto.type ?? CustomerType.INDIVIDUAL;

    const customer = await this.prisma.$transaction(async (tx) => {
      const c = await tx.customer.create({
        data: {
          companyId,
          customerNumber,
          type,
          firstName: dto.firstName ?? (type === CustomerType.INDIVIDUAL ? lead.name.split(' ')[0] : undefined),
          lastName: dto.lastName ?? (type === CustomerType.INDIVIDUAL ? lead.name.split(' ').slice(1).join(' ') || undefined : undefined),
          companyName: dto.companyName ?? (type === CustomerType.CORPORATE ? lead.companyName ?? lead.name : undefined),
          email: lead.email ?? undefined,
          phone: lead.phone ?? undefined,
          whatsappNumber: lead.whatsappNumber ?? undefined,
        },
      });

      await tx.lead.update({
        where: { id },
        data: {
          customerId: c.id,
          stageHistory: {
            create: { fromStage: lead.stage, toStage: LeadStage.DEPOSIT_RECEIVED, changedByUserId: userId, note: 'Converted to customer' },
          },
          stage: LeadStage.DEPOSIT_RECEIVED,
        },
      });

      return c;
    });

    await this.audit.log({ companyId, userId, action: 'leads.convert', entityType: 'Lead', entityId: id, newValue: { customerId: customer.id } });
    return customer;
  }

  async remove(companyId: string, id: string, userId?: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, companyId, deletedAt: null } });
    if (!lead) throw new NotFoundException('Lead not found');

    await this.prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ companyId, userId, action: 'leads.delete', entityType: 'Lead', entityId: id });
  }
}
