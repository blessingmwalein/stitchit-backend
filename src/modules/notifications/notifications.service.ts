import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    companyId: string;
    userId: string;
    type: string;
    title: string;
    body?: string;
    extra?: Record<string, any>;
  }) {
    return this.prisma.notification.create({
      data: {
        companyId: data.companyId,
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.extra,
      },
    });
  }

  async fanOut(data: {
    companyId: string;
    type?: string;
    title: string;
    body: string;
    extra?: Record<string, any>;
    userIds?: string[];
    roles?: string[];
  }) {
    let targetUserIds: string[] = data.userIds ?? [];

    if (!targetUserIds.length) {
      const users = await this.prisma.user.findMany({
        where: {
          companyId: data.companyId,
          isActive: true,
          deletedAt: null,
          ...(data.roles?.length && {
            roles: { some: { role: { name: { in: data.roles } } } },
          }),
        },
        select: { id: true },
      });
      targetUserIds = users.map((u) => u.id);
    }

    if (!targetUserIds.length) return;

    await this.prisma.notification.createMany({
      data: targetUserIds.map((userId) => ({
        companyId: data.companyId,
        userId,
        type: data.type ?? 'general',
        title: data.title,
        body: data.body,
        data: data.extra ?? undefined,
      })),
      skipDuplicates: true,
    });
  }

  async findForUser(userId: string, pagination: PaginationDto, onlyUnread = false) {
    const where = { userId, ...(onlyUnread && { readAt: null }) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.notification.count({ where }),
    ]);
    // annotate isRead for frontend convenience
    const data = rows.map((n) => ({ ...n, isRead: n.readAt !== null }));
    return paginate(data, total, pagination);
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
