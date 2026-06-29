import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../decorators/current-user.decorator';

/** Restricts a route to authenticated customer-portal principals. */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;
    if (!user || user.aud !== 'customer') {
      throw new ForbiddenException('Customer access only');
    }
    return true;
  }
}
