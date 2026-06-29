import { Controller, Get, Post, Patch, Body, Param, Query, ParseUUIDPipe, HttpCode, HttpStatus } from '@nestjs/common';
import { JobCostService } from './job-cost.service';
import { PricingService } from './pricing.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PriceCalculateDto, UpdateCostSheetDto } from './dto/costing.dto';

@Controller()
export class CostingController {
  constructor(
    private readonly jobCost: JobCostService,
    private readonly pricing: PricingService,
  ) {}

  // ── Pricing calculator ────────────────────────────────────────────────────

  @Get('pricing/calculate')
  @RequirePermissions('orders.read')
  calculate(@CurrentUser() u: AuthUser, @Query() dto: PriceCalculateDto) {
    return this.pricing.calculate(u.companyId, dto);
  }

  @Get('pricing/settings')
  @RequirePermissions('settings.read')
  getPricingSettings(@CurrentUser() u: AuthUser) {
    return this.pricing.getSettings(u.companyId);
  }

  @Patch('pricing/settings')
  @RequirePermissions('settings.write')
  updatePricingSettings(@CurrentUser() u: AuthUser, @Body() value: Record<string, any>) {
    return this.pricing.updateSettings(u.companyId, value);
  }

  // ── Job cost sheets ───────────────────────────────────────────────────────

  @Get('costing/jobs')
  @RequirePermissions('production.jobs.read')
  listCostSheets(@CurrentUser() u: AuthUser) {
    return this.jobCost.findAll(u.companyId);
  }

  @Get('costing/jobs/:jobId')
  @RequirePermissions('production.jobs.read')
  getCostSheet(@CurrentUser() u: AuthUser, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.jobCost.findOne(u.companyId, jobId);
  }

  @Post('costing/jobs/:jobId/init')
  @RequirePermissions('production.jobs.update')
  @HttpCode(HttpStatus.OK)
  initCostSheet(@CurrentUser() u: AuthUser, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.jobCost.getOrCreate(u.companyId, jobId);
  }

  @Patch('costing/jobs/:jobId')
  @RequirePermissions('production.jobs.update')
  updateCostSheet(
    @CurrentUser() u: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Body() dto: UpdateCostSheetDto,
  ) {
    return this.jobCost.update(u.companyId, jobId, dto);
  }

  @Post('costing/jobs/:jobId/recalculate')
  @RequirePermissions('production.jobs.update')
  @HttpCode(HttpStatus.OK)
  recalculate(@CurrentUser() u: AuthUser, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.jobCost.recalculate(u.companyId, jobId);
  }
}
