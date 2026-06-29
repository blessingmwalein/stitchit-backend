import { Global, Module } from '@nestjs/common';
import { PermissionsCacheService } from './permissions-cache.service';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';

@Global()
@Module({
  controllers: [RbacController],
  providers: [PermissionsCacheService, RbacService],
  exports: [PermissionsCacheService],
})
export class RbacModule {}
