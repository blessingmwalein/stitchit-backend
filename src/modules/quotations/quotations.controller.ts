import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateQuotationDto,
  UpdateQuotationDto,
  SendQuotationDto,
  RejectQuotationDto,
  QuotationFilterDto,
} from './dto/quotations.dto';

@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Post()
  @RequirePermissions('quotations.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateQuotationDto) {
    return this.quotations.create(user.companyId, dto, user.sub);
  }

  @Get()
  @RequirePermissions('quotations.read')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() filter: QuotationFilterDto,
    @Query() pagination: PaginationDto,
  ) {
    return this.quotations.findAll(user.companyId, filter, pagination);
  }

  @Get(':id')
  @RequirePermissions('quotations.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.findOne(user.companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('quotations.update')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationDto,
  ) {
    return this.quotations.update(user.companyId, id, dto, user.sub);
  }

  @Post(':id/send')
  @RequirePermissions('quotations.update')
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendQuotationDto,
  ) {
    return this.quotations.send(user.companyId, id, dto, user.sub);
  }

  @Post(':id/approve')
  @RequirePermissions('quotations.approve')
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.approve(user.companyId, id, user.sub);
  }

  @Post(':id/reject')
  @RequirePermissions('quotations.approve')
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectQuotationDto,
  ) {
    return this.quotations.reject(user.companyId, id, dto, user.sub);
  }

  @Post(':id/convert')
  @RequirePermissions('orders.create')
  convertToOrder(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.convertToOrder(user.companyId, id, user.sub);
  }

  @Delete(':id')
  @RequirePermissions('quotations.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.quotations.remove(user.companyId, id, user.sub);
  }
}
