import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface CacheEntry {
  permissions: Set<string>;
  expiresAt: number;
}

const TTL_MS = 60_000;

/** Per-user permission set, cached in-process for 60s. */
@Injectable()
export class PermissionsCacheService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async getPermissions(userId: string): Promise<Set<string>> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.permissions;

    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    const permissions = new Set<string>(
      rows.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.code)),
    );
    this.cache.set(userId, { permissions, expiresAt: Date.now() + TTL_MS });
    return permissions;
  }

  invalidate(userId?: string): void {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }
}
