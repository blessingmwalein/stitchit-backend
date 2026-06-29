import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async get(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  update(companyId: string, data: Prisma.CompanyUpdateInput) {
    return this.prisma.company.update({ where: { id: companyId }, data });
  }

  listBranches(companyId: string) {
    return this.prisma.branch.findMany({ where: { companyId, isActive: true }, orderBy: { name: 'asc' } });
  }

  // --- settings ---

  async getSetting<T = unknown>(companyId: string, key: string): Promise<T | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { companyId_key: { companyId, key } },
    });
    return (row?.value as T) ?? null;
  }

  async setSetting(companyId: string, key: string, value: unknown) {
    return this.prisma.systemSetting.upsert({
      where: { companyId_key: { companyId, key } },
      update: { value: value as Prisma.InputJsonValue },
      create: { companyId, key, value: value as Prisma.InputJsonValue },
    });
  }

  listSettings(companyId: string) {
    return this.prisma.systemSetting.findMany({ where: { companyId } });
  }

  listSequences(companyId: string) {
    return this.prisma.numberSequence.findMany({ where: { companyId }, orderBy: { docType: 'asc' } });
  }

  updateSequence(companyId: string, docType: string, data: { prefix?: string; padLength?: number; yearlyReset?: boolean }) {
    return this.prisma.numberSequence.update({
      where: { companyId_docType: { companyId, docType: docType as never } },
      data,
    });
  }
}
