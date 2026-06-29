import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCommunicationDto } from './dto/crm.dto';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';

@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateCommunicationDto, userId?: string) {
    if (dto.leadId) {
      const lead = await this.prisma.lead.findFirst({ where: { id: dto.leadId, companyId, deletedAt: null } });
      if (!lead) throw new NotFoundException('Lead not found');
    }
    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, companyId, deletedAt: null } });
      if (!customer) throw new NotFoundException('Customer not found');
    }

    return this.prisma.communicationLog.create({
      data: {
        companyId,
        channel: dto.channel,
        direction: dto.direction,
        subject: dto.subject,
        body: dto.body,
        loggedByUserId: userId,
        leadId: dto.leadId,
        customerId: dto.customerId,
        relatedType: dto.relatedType,
        relatedId: dto.relatedId,
      },
    });
  }

  async findForLead(companyId: string, leadId: string, pagination: PaginationDto) {
    const lead = await this.prisma.lead.findFirst({ where: { id: leadId, companyId, deletedAt: null } });
    if (!lead) throw new NotFoundException('Lead not found');

    const where = { companyId, leadId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.communicationLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }),
      this.prisma.communicationLog.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }

  async findForCustomer(companyId: string, customerId: string, pagination: PaginationDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, companyId, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found');

    const where = { companyId, customerId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.communicationLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.take }),
      this.prisma.communicationLog.count({ where }),
    ]);
    return paginate(data, total, pagination);
  }
}
