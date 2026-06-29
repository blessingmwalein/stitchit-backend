import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { CostingModule } from '../costing/costing.module';

@Module({
  imports: [CostingModule],
  controllers: [PublicController],
})
export class PublicModule {}
