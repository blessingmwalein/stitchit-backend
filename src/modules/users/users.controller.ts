import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { UsersService } from './users.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Audited } from '../../common/decorators/audit.decorator';

class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsArray()
  roleIds!: string[];
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsArray()
  roleIds?: string[];
}

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users.view')
  list(@CurrentUser() user: AuthUser, @Query() query: PaginationDto) {
    return this.users.list(user.companyId, query);
  }

  @Get(':id')
  @RequirePermissions('users.view')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.get(user.companyId, id);
  }

  @Post()
  @RequirePermissions('users.create')
  @Audited('users.create', 'User')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(user.companyId, dto);
  }

  @Patch(':id')
  @RequirePermissions('users.update')
  @Audited('users.update', 'User')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(user.companyId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('users.delete')
  @Audited('users.delete', 'User')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.remove(user.companyId, id);
  }
}
