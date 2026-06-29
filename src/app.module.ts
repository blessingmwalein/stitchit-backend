import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { UsersModule } from './modules/users/users.module';
import { AuditModule } from './modules/audit/audit.module';
import { StorageModule } from './modules/storage/storage.module';
import { CompanyModule } from './modules/company/company.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HealthModule } from './modules/health/health.module';
import { CrmModule } from './modules/crm/crm.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { ProductionModule } from './modules/production/production.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { InvoicingModule } from './modules/invoicing/invoicing.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { CostingModule } from './modules/costing/costing.module';
import { QueuesModule } from './queues/queues.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { MailModule } from './modules/mail/mail.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PortalModule } from './modules/portal/portal.module';
import { PublicModule } from './modules/public/public.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { PaymentsGatewayModule } from './modules/payments-gateway/payments-gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuthModule,
    RbacModule,
    UsersModule,
    AuditModule,
    StorageModule,
    CompanyModule,
    DocumentsModule,
    HealthModule,
    CrmModule,
    QuotationsModule,
    OrdersModule,
    InventoryModule,
    ProcurementModule,
    ProductionModule,
    AccountingModule,
    InvoicingModule,
    ReportingModule,
    CostingModule,
    QueuesModule,
    PdfModule,
    MailModule,
    NotificationsModule,
    PortalModule,
    PublicModule,
    WhatsAppModule,
    PaymentsGatewayModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
