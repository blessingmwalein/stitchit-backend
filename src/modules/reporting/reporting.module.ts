import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { DashboardService } from './dashboard.service';
import { ReportingController } from './reporting.controller';

@Module({
  controllers: [ReportingController],
  providers: [ReportsService, DashboardService],
  exports: [ReportsService, DashboardService],
})
export class ReportingModule {}
