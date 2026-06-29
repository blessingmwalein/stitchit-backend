import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import { PermissionsCacheService } from '../rbac/permissions-cache.service';

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
} satisfies Prisma.UserSelect;

function shape(user: Prisma.UserGetPayload<{ select: typeof userSelect }>) {
  return { ...user, roles: user.roles.map((r) => r.role) };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsCache: PermissionsCacheService,
  ) {}

  async list(companyId: string, query: PaginationDto) {
    const where: Prisma.UserWhereInput = {
      companyId,
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(data.map(shape), total, query);
  }

  async get(companyId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, companyId, deletedAt: null },
      select: userSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return shape(user);
  }

  async create(
    companyId: string,
    data: { email: string; password: string; firstName: string; lastName: string; phone?: string; roleIds: string[] },
  ) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email.toLowerCase().trim() } });
    if (existing) throw new BadRequestException('Email already in use');

    const user = await this.prisma.user.create({
      data: {
        companyId,
        email: data.email.toLowerCase().trim(),
        passwordHash: await bcrypt.hash(data.password, 10),
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        roles: { create: data.roleIds.map((roleId) => ({ roleId })) },
      },
      select: userSelect,
    });
    return shape(user);
  }

  async update(
    companyId: string,
    id: string,
    data: { firstName?: string; lastName?: string; phone?: string; isActive?: boolean; password?: string; roleIds?: string[] },
  ) {
    await this.get(companyId, id);
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        isActive: data.isActive,
        ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 10) } : {}),
        ...(data.roleIds
          ? { roles: { deleteMany: {}, create: data.roleIds.map((roleId) => ({ roleId })) } }
          : {}),
      },
      select: userSelect,
    });
    this.permissionsCache.invalidate(id);
    return shape(user);
  }

  async remove(companyId: string, id: string) {
    await this.get(companyId, id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    this.permissionsCache.invalidate(id);
  }
}
