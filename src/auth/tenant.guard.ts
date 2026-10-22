import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.schoolId)
      throw new ForbiddenException('প্রতিষ্ঠানের তথ্য পাওয়া যায়নি');
    const requestedSchool = request.headers['x-school-id'];
    if (
      typeof requestedSchool === 'string' &&
      requestedSchool !== request.user.schoolId
    )
      throw new ForbiddenException(
        'অন্য প্রতিষ্ঠানের তথ্য ব্যবহারের অনুমতি নেই',
      );
    return true;
  }
}
