import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { RbacService } from './rbac.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Audited } from '../../common/decorators/audit.decorator';

class RoleDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  permissions!: string[];
}

class RoleUpdateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  permissions?: string[];
}

@Controller()
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('permissions')
  @RequirePermissions('users.manage_roles')
  listPermissions() {
    return this.rbac.listPermissions();
  }

  @Get('roles')
  @RequirePermissions('users.view')
  listRoles(@CurrentUser() user: AuthUser) {
    return this.rbac.listRoles(user.companyId);
  }

  @Post('roles')
  @RequirePermissions('users.manage_roles')
  @Audited('roles.create', 'Role')
  createRole(@CurrentUser() user: AuthUser, @Body() dto: RoleDto) {
    return this.rbac.createRole(user.companyId, dto);
  }

  @Patch('roles/:id')
  @RequirePermissions('users.manage_roles')
  @Audited('roles.update', 'Role')
  updateRole(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RoleUpdateDto) {
    return this.rbac.updateRole(user.companyId, id, dto);
  }

  @Delete('roles/:id')
  @RequirePermissions('users.manage_roles')
  @Audited('roles.delete', 'Role')
  deleteRole(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.rbac.deleteRole(user.companyId, id);
  }
}
