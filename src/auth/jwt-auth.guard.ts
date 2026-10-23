import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { jwtVerify } from 'jose';
import type { IncomingMessage } from 'node:http';
import type { AccessTokenPayload, AuthUser } from './auth.types.js';

export type AuthenticatedRequest = IncomingMessage & { user: AuthUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer '))
      throw new UnauthorizedException('অনুমতি প্রয়োজন');
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET is not configured');
      const { payload } = await jwtVerify(
        header.slice(7),
        new TextEncoder().encode(secret),
        { algorithms: ['HS256'] },
      );
      const token = payload as unknown as AccessTokenPayload;
      if (
        token.tokenType !== 'access' ||
        typeof token.sub !== 'string' ||
        typeof token.schoolId !== 'string'
      )
        throw new Error('Invalid token');
      request.user = {
        id: token.sub,
        schoolId: token.schoolId,
        role: token.role,
        displayNameBn:
          typeof token.displayNameBn === 'string' ? token.displayNameBn : '',
      };
      return true;
    } catch {
      throw new UnauthorizedException('সেশনটি বৈধ নয়');
    }
  }
}
