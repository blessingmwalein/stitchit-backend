import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type AuthAudience = 'staff' | 'customer';

export interface AuthUser {
  sub: string;
  companyId: string;
  aud: AuthAudience;
  email?: string;
  name?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | unknown => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUser = request.user;
    return data ? user?.[data] : user;
  },
);
