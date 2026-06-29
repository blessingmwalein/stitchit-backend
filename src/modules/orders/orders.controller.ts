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
import { OrdersService } from './orders.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  CreateOrderDto,
  UpdateOrderDto,
  ChangeOrderStatusDto,
  AddAttachmentDto,
  OrderFilterDto,
} from './dto/orders.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @RequirePermissions('orders.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.companyId, dto, user.sub);
  }

  @Get()
  @RequirePermissions('orders.read')
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() filter: OrderFilterDto,
    @Query() pagination: PaginationDto,
  ) {
    return this.orders.findAll(user.companyId, filter, pagination);
  }

  @Get(':id')
  @RequirePermissions('orders.read')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(user.companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('orders.update')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.orders.update(user.companyId, id, dto, user.sub);
  }

  @Patch(':id/status')
  @RequirePermissions('orders.update')
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeOrderStatusDto,
  ) {
    return this.orders.changeStatus(user.companyId, id, dto, user.sub);
  }

  @Post(':id/attachments')
  @RequirePermissions('orders.update')
  addAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddAttachmentDto,
  ) {
    return this.orders.addAttachment(user.companyId, id, dto, user.sub);
  }

  @Delete(':id/attachments/:attachmentId')
  @RequirePermissions('orders.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.orders.removeAttachment(user.companyId, id, attachmentId, user.sub);
  }

  @Delete(':id')
  @RequirePermissions('orders.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.remove(user.companyId, id, user.sub);
  }
}
