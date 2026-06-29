import {
  Controller, Get, Post, Patch, Body, Param, Query,
  ParseUUIDPipe, HttpCode, HttpStatus, UseGuards, Request,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PortalAuthService } from './portal-auth.service';
import { PortalService } from './portal.service';
import { PortalJwtGuard } from '../../common/guards/portal-jwt.guard';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import {
  PortalLoginDto, PortalRegisterDto, PortalRefreshDto, PortalUpdateProfileDto,
  ApproveQuoteDto, RejectQuoteDto,
} from './dto/portal.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

// ── Portal Auth (public — no JWT needed) ─────────────────────────────────────

@Controller('portal/auth')
@Public()
export class PortalAuthController {
  constructor(private readonly auth: PortalAuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: PortalLoginDto, @Request() req: any) {
    return this.auth.login(dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: PortalRegisterDto, @Request() req: any) {
    // Use default company — in single-tenant setup there's only one
    const companyId = req.headers['x-company-id'] ?? process.env.DEFAULT_COMPANY_ID;
    return this.auth.register(companyId, dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: PortalRefreshDto, @Request() req: any) {
    return this.auth.refresh(dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Body('refreshToken') refreshToken: string) {
    return this.auth.logout(refreshToken);
  }
}

// ── Portal Protected (customer JWT required) ──────────────────────────────────

@Controller('portal')
@Public()
@UseGuards(PortalJwtGuard)
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('me')
  getMe(@CurrentUser() u: AuthUser) {
    return this.portal.getProfile(u.sub);
  }

  @Patch('me')
  updateProfile(@CurrentUser() u: AuthUser, @Body() dto: PortalUpdateProfileDto) {
    return this.portal.updateProfile(u.sub, dto);
  }

  @Post('me/change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() u: AuthUser,
    @Body('currentPassword') current: string,
    @Body('newPassword') next: string,
  ) {
    return this.portal.changePassword(u.sub, current, next);
  }

  // ── Quotes ─────────────────────────────────────────────────────────────────

  @Get('quotes')
  listQuotes(@CurrentUser() u: AuthUser, @Query() p: PaginationDto) {
    return this.portal.listQuotes(u.sub, p.page, p.pageSize);
  }

  @Get('quotes/:id')
  getQuote(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.getQuote(u.sub, id);
  }

  @Post('quotes/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveQuote(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveQuoteDto,
  ) {
    return this.portal.approveQuote(u.sub, id, dto);
  }

  @Post('quotes/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectQuote(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectQuoteDto,
  ) {
    return this.portal.rejectQuote(u.sub, id, dto);
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  @Get('orders')
  listOrders(@CurrentUser() u: AuthUser, @Query() p: PaginationDto) {
    return this.portal.listOrders(u.sub, p.page, p.pageSize);
  }

  @Get('orders/:id')
  getOrder(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.getOrder(u.sub, id);
  }

  @Get('orders/:id/documents')
  getOrderDocuments(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.getOrderDocuments(u.sub, id);
  }

  // ── Invoices + Payments ────────────────────────────────────────────────────

  @Get('invoices')
  listInvoices(@CurrentUser() u: AuthUser, @Query() p: PaginationDto) {
    return this.portal.listInvoices(u.sub, p.page, p.pageSize);
  }

  @Get('payments')
  listPayments(@CurrentUser() u: AuthUser, @Query() p: PaginationDto) {
    return this.portal.listPayments(u.sub, p.page, p.pageSize);
  }

  // ── Notifications ──────────────────────────────────────────────────────────

  @Get('notifications')
  listNotifications(@CurrentUser() u: AuthUser, @Query() p: PaginationDto) {
    return this.portal.listNotifications(u.sub, p.page, p.pageSize);
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.portal.markNotificationRead(u.sub, id);
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() u: AuthUser) {
    return this.portal.markAllNotificationsRead(u.sub);
  }
}
