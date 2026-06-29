import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PortalAuthService } from './portal-auth.service';
import { PortalService } from './portal.service';
import { PortalAuthController, PortalController } from './portal.controller';
import { AuthModule } from '../auth/auth.module';
import { PortalJwtGuard } from '../../common/guards/portal-jwt.guard';

@Module({
  imports: [AuthModule],
  controllers: [PortalAuthController, PortalController],
  providers: [PortalAuthService, PortalService, PortalJwtGuard],
})
export class PortalModule {}
