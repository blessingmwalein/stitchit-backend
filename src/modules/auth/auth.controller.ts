import { Body, Controller, Get, HttpCode, Ip, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { GoogleOAuthService } from './google-oauth.service';
import { LoginDto, RefreshDto } from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Audited } from '../../common/decorators/audit.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Audited('auth.login')
  login(@Body() dto: LoginDto, @Ip() ip: string, @Req() req: Request) {
    return this.authService.login(dto.email, dto.password, {
      ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto, @Ip() ip: string, @Req() req: Request) {
    return this.authService.refresh(dto.refreshToken, {
      ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('logout')
  @HttpCode(204)
  @Audited('auth.logout')
  async logout(@Body() dto: RefreshDto) {
    await this.authService.logout(dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.authService.profile(user.sub);
  }

  // ── Google OAuth (customer portal) ─────────────────────────────────────────

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Passport redirects — no body needed
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const { sessionKey } = req.user as { sessionKey: string };
    const webUrl = this.config.get<string>('app.webUrl') ?? 'http://localhost:3002';
    return res.redirect(`${webUrl}/auth/google/callback?session=${sessionKey}`);
  }

  @Public()
  @Post('google/exchange-session')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  exchangeGoogleSession(@Body('session') session: string) {
    return this.googleOAuth.exchangeSession(session);
  }

  @Public()
  @Post('google/complete-registration')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  completeGoogleRegistration(@Body() payload: {
    googleId: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    address?: string;
    avatarUrl?: string;
  }) {
    return this.googleOAuth.completeRegistration(payload);
  }
}
