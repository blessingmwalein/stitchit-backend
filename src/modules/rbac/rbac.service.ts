import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsCacheService } from './permissions-cache.service';

@Injectable()
export class RbacService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsCache: PermissionsCacheService,
  ) {}

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { code: 'asc' }] });
  }

  async listRoles(companyId: string) {
    const roles = await this.prisma.role.findMany({
      where: { OR: [{ companyId }, { companyId: null }] },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.permissions.map((p) => p.permission.code),
    }));
  }

  async createRole(companyId: string, data: { name: string; description?: string; permissions: string[] }) {
    const role = await this.prisma.role.create({
      data: { companyId, name: data.name, description: data.description },
    });
    await this.setRolePermissions(role.id, data.permissions);
    return role;
  }

  async updateRole(companyId: string, roleId: string, data: { name?: string; description?: string; permissions?: string[] }) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, companyId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem && data.name && data.name !== role.name) {
      throw new BadRequestException('System roles cannot be renamed');
    }
    await this.prisma.role.update({
      where: { id: roleId },
      data: { name: data.name, description: data.description },
    });
    if (data.permissions) await this.setRolePermissions(roleId, data.permissions);
    this.permissionsCache.invalidate();
    return this.prisma.role.findUnique({ where: { id: roleId } });
  }

  async deleteRole(companyId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, companyId },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    if (role._count.users > 0) throw new BadRequestException('Role is assigned to users');
    await this.prisma.role.delete({ where: { id: roleId } });
  }

  private async setRolePermissions(roleId: string, codes: string[]) {
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      }),
    ]);
    this.permissionsCache.invalidate();
  }
}
