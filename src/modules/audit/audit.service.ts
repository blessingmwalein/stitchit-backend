import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';

export interface AuditEvent {
  companyId?: string;
  userId?: string;
  customerId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Fire-and-forget append; auditing must never break the business operation. */
  async log(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          companyId: event.companyId,
          userId: event.userId,
          customerId: event.customerId,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          oldValue: event.oldValue as Prisma.InputJsonValue | undefined,
          newValue: event.newValue as Prisma.InputJsonValue | undefined,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log for ${event.action}`, err instanceof Error ? err.stack : err);
    }
  }

  async list(
    companyId: string,
    query: PaginationDto & { action?: string; entityType?: string; entityId?: string; userId?: string; from?: string; to?: string },
  ) {
    const where: Prisma.AuditLogWhereInput = {
      companyId,
      ...(query.action ? { action: { contains: query.action } } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(data, total, query);
  }
}
