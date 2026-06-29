import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePeriodDto } from './dto/accounting.dto';

@Injectable()
export class PeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.fiscalPeriod.findMany({
      where: { companyId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async create(companyId: string, dto: CreatePeriodDto) {
    return this.prisma.fiscalPeriod.upsert({
      where: { companyId_year_month: { companyId, year: dto.year, month: dto.month } },
      create: { companyId, year: dto.year, month: dto.month, status: 'OPEN' },
      update: {},
    });
  }

  async close(companyId: string, id: string) {
    const period = await this.prisma.fiscalPeriod.findFirst({ where: { id, companyId } });
    if (!period) throw new NotFoundException('Fiscal period not found');
    if (period.status === 'CLOSED') throw new BadRequestException('Period is already closed');
    return this.prisma.fiscalPeriod.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
  }

  async reopen(companyId: string, id: string) {
    const period = await this.prisma.fiscalPeriod.findFirst({ where: { id, companyId } });
    if (!period) throw new NotFoundException('Fiscal period not found');
    return this.prisma.fiscalPeriod.update({
      where: { id },
      data: { status: 'OPEN', closedAt: null },
    });
  }

  /** Resolve (or auto-create) the open period for a given date. Throws if closed. */
  async resolve(companyId: string, date: Date): Promise<string> {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const period = await this.prisma.fiscalPeriod.upsert({
      where: { companyId_year_month: { companyId, year, month } },
      create: { companyId, year, month, status: 'OPEN' },
      update: {},
    });
    if (period.status === 'CLOSED') {
      throw new BadRequestException(
        `Fiscal period ${year}-${String(month).padStart(2, '0')} is closed`,
      );
    }
    return period.id;
  }
}
