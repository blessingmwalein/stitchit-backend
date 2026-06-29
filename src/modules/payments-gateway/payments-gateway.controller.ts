import {
  Controller, Post, Body, Req,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { PaymentsGatewayService } from './payments-gateway.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { InitiatePaynowDto } from './dto/payments-gateway.dto';

@Controller('payments-gateway')
export class PaymentsGatewayController {
  constructor(private readonly svc: PaymentsGatewayService) {}

  @Post('paynow/initiate')
  @RequirePermissions('payments.create')
  initiatePaynow(@CurrentUser() u: AuthUser, @Body() dto: InitiatePaynowDto) {
    return this.svc.initiatePaynow({ ...dto, companyId: u.companyId });
  }

  @Post('paynow/webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  paynowWebhook() {
    // Webhook processing disabled — return OK to prevent Paynow retries
    return 'OK';
  }
}
