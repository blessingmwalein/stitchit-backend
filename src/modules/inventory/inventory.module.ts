import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { StockService } from './stock.service';
import {
  MaterialCategoriesController,
  WarehousesController,
  MaterialsController,
  StockController,
} from './inventory.controller';

@Module({
  controllers: [MaterialCategoriesController, WarehousesController, MaterialsController, StockController],
  providers: [InventoryService, StockService],
  exports: [InventoryService, StockService],
})
export class InventoryModule {}
