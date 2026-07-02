import { Controller, Get, Query, ParseUUIDPipe } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { DashboardService } from './dashboard.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { DateRangeDto, AccountLedgerDto, CustomerStatementDto, AgingDto } from './dto/reporting.dto';

@Controller('reports')
export class ReportingController {
  constructor(
    private readonly reports: ReportsService,
    private readonly dashboard: DashboardService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('reports.read')
  kpis(
    @CurrentUser() u: AuthUser,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
  ) {
    return this.dashboard.kpis(u.companyId, fromDate, toDate);
  }

  @Get('dashboard/activity')
  @RequirePermissions('reports.read')
  activity(@CurrentUser() u: AuthUser) {
    return this.dashboard.recentActivity(u.companyId);
  }

  @Get('trial-balance')
  @RequirePermissions('finance.read')
  trialBalance(@CurrentUser() u: AuthUser, @Query() dto: DateRangeDto) {
    return this.reports.trialBalance(u.companyId, new Date(dto.fromDate), new Date(dto.toDate));
  }

  @Get('general-ledger')
  @RequirePermissions('finance.read')
  generalLedger(@CurrentUser() u: AuthUser, @Query() dto: AccountLedgerDto) {
    return this.reports.generalLedger(
      u.companyId,
      dto.accountId,
      new Date(dto.fromDate),
      new Date(dto.toDate),
    );
  }

  @Get('income-statement')
  @RequirePermissions('finance.read')
  incomeStatement(@CurrentUser() u: AuthUser, @Query() dto: DateRangeDto) {
    return this.reports.incomeStatement(u.companyId, new Date(dto.fromDate), new Date(dto.toDate));
  }

  @Get('balance-sheet')
  @RequirePermissions('finance.read')
  balanceSheet(@CurrentUser() u: AuthUser, @Query('asOf') asOf?: string) {
    return this.reports.balanceSheet(u.companyId, asOf ? new Date(asOf) : new Date());
  }

  @Get('ar-aging')
  @RequirePermissions('finance.read')
  arAging(@CurrentUser() u: AuthUser, @Query() dto: AgingDto) {
    return this.reports.arAging(u.companyId, dto.asOf ? new Date(dto.asOf) : new Date());
  }

  @Get('ap-aging')
  @RequirePermissions('finance.read')
  apAging(@CurrentUser() u: AuthUser, @Query() dto: AgingDto) {
    return this.reports.apAging(u.companyId, dto.asOf ? new Date(dto.asOf) : new Date());
  }

  @Get('customer-statement')
  @RequirePermissions('finance.read')
  customerStatement(@CurrentUser() u: AuthUser, @Query() dto: CustomerStatementDto) {
    return this.reports.customerStatement(
      u.companyId,
      dto.customerId,
      new Date(dto.fromDate),
      new Date(dto.toDate),
    );
  }

  @Get('inventory-valuation')
  @RequirePermissions('reports.read')
  inventoryValuation(@CurrentUser() u: AuthUser) {
    return this.reports.inventoryValuation(u.companyId);
  }
}
