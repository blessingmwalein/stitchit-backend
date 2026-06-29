import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountSubtype } from '@prisma/client';
import { CreateAccountDto, UpdateAccountDto } from './dto/accounting.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.account.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
    });
  }

  async findTree(companyId: string) {
    const all = await this.prisma.account.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
    });
    const map = new Map(all.map((a) => [a.id, { ...a, children: [] as typeof all }]));
    const roots: typeof all = [];
    for (const acc of map.values()) {
      if (acc.parentId) {
        map.get(acc.parentId)?.children.push(acc as any);
      } else {
        roots.push(acc as any);
      }
    }
    return roots;
  }

  async findOne(companyId: string, id: string) {
    const acc = await this.prisma.account.findFirst({ where: { id, companyId } });
    if (!acc) throw new NotFoundException('Account not found');
    return acc;
  }

  async create(companyId: string, dto: CreateAccountDto) {
    const exists = await this.prisma.account.findUnique({
      where: { companyId_code: { companyId, code: dto.code } },
    });
    if (exists) throw new BadRequestException(`Account code ${dto.code} already exists`);
    return this.prisma.account.create({ data: { companyId, ...dto } });
  }

  async update(companyId: string, id: string, dto: UpdateAccountDto) {
    await this.findOne(companyId, id);
    return this.prisma.account.update({ where: { id }, data: dto });
  }

  /** Resolve a single account by subtype — throws if none found */
  async bySubtype(companyId: string, subtype: AccountSubtype) {
    const acc = await this.prisma.account.findFirst({
      where: { companyId, subtype, isActive: true },
    });
    if (!acc) throw new Error(`No active account with subtype ${subtype}`);
    return acc;
  }

  /** Resolve multiple subtypes — returns Map<subtype, account> */
  async bySubtypes(companyId: string, subtypes: AccountSubtype[]) {
    const accounts = await this.prisma.account.findMany({
      where: { companyId, subtype: { in: subtypes }, isActive: true },
    });
    const map = new Map<AccountSubtype, (typeof accounts)[0]>();
    for (const acc of accounts) map.set(acc.subtype, acc);
    for (const st of subtypes) {
      if (!map.has(st)) throw new Error(`No active account with subtype ${st}`);
    }
    return map;
  }
}
