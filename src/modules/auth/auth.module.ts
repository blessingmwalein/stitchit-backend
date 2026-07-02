import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokenService } from './token.service';
import { GoogleOAuthService } from './google-oauth.service';
import { GoogleStrategy } from './google.strategy';
import { RbacModule } from '../rbac/rbac.module';

@Global()
@Module({
  imports: [JwtModule.register({}), PassportModule, RbacModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, GoogleOAuthService, GoogleStrategy],
  exports: [AuthService, TokenService, JwtModule],
})
export class AuthModule {}
