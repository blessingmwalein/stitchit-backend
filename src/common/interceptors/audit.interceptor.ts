import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';
import { AuthUser } from '../decorators/current-user.decorator';
import { AuditService } from '../../modules/audit/audit.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_KEY, context.getHandler());
    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;

    return next.handle().pipe(
      tap((result) => {
        void this.auditService.log({
          companyId: user?.companyId,
          userId: user?.aud === 'staff' ? user.sub : undefined,
          customerId: user?.aud === 'customer' ? user.sub : undefined,
          action: meta.action,
          entityType: meta.entityType,
          entityId: (result as { id?: string } | undefined)?.id ?? request.params?.id,
          newValue: this.safeBody(request.body),
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });
      }),
    );
  }

  private safeBody(body: unknown): Record<string, unknown> | undefined {
    if (!body || typeof body !== 'object') return undefined;
    const clone = { ...(body as Record<string, unknown>) };
    for (const key of ['password', 'passwordHash', 'passwordConfirmation', 'currentPassword', 'newPassword']) {
      if (key in clone) clone[key] = '[REDACTED]';
    }
    return clone;
  }
}
