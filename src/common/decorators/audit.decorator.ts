import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMeta {
  action: string; // e.g. orders.update
  entityType?: string; // e.g. Order
}

/** Marks a handler for audit logging by the AuditInterceptor. */
export const Audited = (action: string, entityType?: string) =>
  SetMetadata(AUDIT_KEY, { action, entityType } satisfies AuditMeta);
