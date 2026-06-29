import { Module } from '@nestjs/common';
import { PaymentsGatewayService } from './payments-gateway.service';
import { PaymentsGatewayController } from './payments-gateway.controller';
import { InvoicingModule } from '../invoicing/invoicing.module';

@Module({
  imports: [InvoicingModule],
  controllers: [PaymentsGatewayController],
  providers: [PaymentsGatewayService],
  exports: [PaymentsGatewayService],
})
export class PaymentsGatewayModule {}
