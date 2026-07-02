import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { GoogleOAuthService } from './google-oauth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService,
    private readonly googleOAuth: GoogleOAuthService,
  ) {
    super({
      clientID: config.get<string>('google.clientId') ?? '',
      clientSecret: config.get<string>('google.clientSecret') ?? '',
      callbackURL: config.get<string>('google.callbackUrl') ??
        'http://localhost:3001/api/v1/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value ?? '';
    const result = await this.googleOAuth.resolveGoogleProfile({
      googleId: profile.id,
      email,
      firstName: profile.name?.givenName ?? profile.displayName.split(' ')[0] ?? '',
      lastName: profile.name?.familyName ?? profile.displayName.split(' ').slice(1).join(' ') ?? '',
      avatarUrl: profile.photos?.[0]?.value,
    });
    done(null, result);
  }
}
