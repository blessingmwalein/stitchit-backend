import { Module } from '@nestjs/common';
import { JobCostService } from './job-cost.service';
import { PricingService } from './pricing.service';
import { CostingController } from './costing.controller';

@Module({
  controllers: [CostingController],
  providers: [JobCostService, PricingService],
  exports: [JobCostService, PricingService],
})
export class CostingModule {}
