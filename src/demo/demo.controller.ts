import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { spawn } from 'node:child_process';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';

@Controller('demo')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('ADMIN')
export class DemoController {
  @Post('reset') reset(@Req() request: AuthenticatedRequest) {
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_DEMO_RESET !== 'true'
    )
      return {
        data: { accepted: false, message: 'Production demo reset is disabled' },
      };
    const child = spawn('pnpm', ['demo:reset'], {
      cwd: process.cwd(),
      env: { ...process.env, DEFAULT_SCHOOL_ID: request.user.schoolId },
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { data: { accepted: true, message: 'ডেমো ডেটা রিসেট শুরু হয়েছে' } };
  }
}
