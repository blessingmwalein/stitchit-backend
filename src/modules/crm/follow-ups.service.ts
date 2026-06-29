import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFollowUpDto, UpdateFollowUpDto } from './dto/crm.dto';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import { FollowUpStatus } from '@prisma/client';

@Injectable()
export class FollowUpsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateFollowUpDto, userId?: string) {
    return this.prisma.followUp.create({
      data: {
        companyId,
        leadId: dto.leadId,
        customerId: dto.customerId,
        dueAt: new Date(dto.dueAt),
        note: dto.note,
        assignedToUserId: dto.assignedToUserId ?? userId,
      },
    });
  }

  async findAll(companyId: string, pagination: PaginationDto, onlyPending = false) {
    const where = {
      companyId,
      ...(onlyPending && { status: FollowUpStatus.PENDING }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.followUp.findMany({
        where,
        include: {
          lead: { select: { id: true, leadNumber: true, name: true } },
          customer: { select: { id: true, customerNumber: true, firstName: true, lastName: true, companyName: true } },
        },
        orderBy: { dueAt: 'asc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.followUp.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  async overdue(companyId: string) {
    return this.prisma.followUp.findMany({
      where: { companyId, status: FollowUpStatus.PENDING, dueAt: { lt: new Date() } },
      include: {
        lead: { select: { id: true, leadNumber: true, name: true } },
        customer: { select: { id: true, customerNumber: true, firstName: true, lastName: true, companyName: true } },
      },
      orderBy: { dueAt: 'asc' },
      take: 50,
    });
  }

  async update(companyId: string, id: string, dto: UpdateFollowUpDto) {
    const fu = await this.prisma.followUp.findFirst({ where: { id, companyId } });
    if (!fu) throw new NotFoundException('Follow-up not found');

    return this.prisma.followUp.update({
      where: { id },
      data: {
        ...(dto.dueAt !== undefined && { dueAt: new Date(dto.dueAt) }),
        ...(dto.note !== undefined && { note: dto.note }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.assignedToUserId !== undefined && { assignedToUserId: dto.assignedToUserId }),
      },
    });
  }

  async complete(companyId: string, id: string) {
    const fu = await this.prisma.followUp.findFirst({ where: { id, companyId } });
    if (!fu) throw new NotFoundException('Follow-up not found');

    return this.prisma.followUp.update({
      where: { id },
      data: { status: FollowUpStatus.DONE, completedAt: new Date() },
    });
  }

  async remove(companyId: string, id: string) {
    const fu = await this.prisma.followUp.findFirst({ where: { id, companyId } });
    if (!fu) throw new NotFoundException('Follow-up not found');
    await this.prisma.followUp.update({ where: { id }, data: { status: FollowUpStatus.CANCELLED } });
  }
}
