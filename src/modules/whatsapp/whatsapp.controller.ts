import {
  Controller, Get, Post, Body, Query, Res, HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { WhatsAppService } from './whatsapp.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { SendWhatsAppDto } from './dto/whatsapp.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private readonly wa: WhatsAppService) {}

  // ── Meta webhook verification (public, GET) ───────────────────────────────

  @Get('webhook')
  @Public()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const result = this.wa.verifyWebhook(mode, token, challenge);
    if (result) {
      res.status(HttpStatus.OK).send(result);
    } else {
      res.status(HttpStatus.FORBIDDEN).send('Verification failed');
    }
  }

  // ── Meta inbound webhook (public, POST) ───────────────────────────────────

  @Post('webhook')
  @Public()
  async receiveWebhook(@Body() payload: any) {
    const company = await this.findDefaultCompany();
    if (company) {
      await this.wa.processInbound(company, payload).catch(() => {});
    }
    return { status: 'ok' }; // Always 200 to Meta
  }

  // ── Staff endpoints ───────────────────────────────────────────────────────

  @Post('send')
  @RequirePermissions('whatsapp.send')
  send(@CurrentUser() u: AuthUser, @Body() dto: SendWhatsAppDto) {
    return this.wa.send(u.companyId, dto);
  }

  @Get('messages')
  @RequirePermissions('whatsapp.read')
  listMessages(
    @CurrentUser() u: AuthUser,
    @Query('customerId') customerId?: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.wa.findMessages(u.companyId, customerId, pagination?.page, pagination?.pageSize);
  }

  // ── Default company helper ────────────────────────────────────────────────

  private async findDefaultCompany(): Promise<string | null> {
    // Injected lazily — avoid circular dep. In practice the companyId comes from the webhook config.
    return process.env.DEFAULT_COMPANY_ID ?? null;
  }
}
