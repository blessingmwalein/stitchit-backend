import { Module } from '@nestjs/common';
import { ProcurementService } from './procurement.service';
import {
  SuppliersController,
  PurchaseOrdersController,
  GrnsController,
  BillsController,
  SupplierPaymentsController,
} from './procurement.controller';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [
    SuppliersController,
    PurchaseOrdersController,
    GrnsController,
    BillsController,
    SupplierPaymentsController,
  ],
  providers: [ProcurementService],
  exports: [ProcurementService],
})
export class ProcurementModule {}
