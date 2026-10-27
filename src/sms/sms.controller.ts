import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SmsService, type Audience, type SmsSettings } from './sms.service.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';
import { ContentMutationDto } from '../content/dto/content-mutation.dto.js';

@Controller('sms')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('ADMIN')
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  @Get('settings') settings(@Req() req: AuthenticatedRequest) {
    return this.sms.getSettings(req.user);
  }

  @Patch('settings') updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    return this.sms.updateSettings(
      req.user,
      dto.value as Partial<SmsSettings>,
    );
  }

  @Get('balance') balance(@Req() req: AuthenticatedRequest) {
    return this.sms.balance(req.user);
  }

  @Post('preview') preview(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    return this.sms.preview(req.user, dto.value as Audience);
  }

  @Post('send') send(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    return this.sms.send(
      req.user,
      dto.value as { audience: Audience; message: string },
    );
  }

  @Post('send-due') sendDue(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    return this.sms.sendDue(req.user, dto.value as { feeEventId: string });
  }

  @Post('send-result') sendResult(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    return this.sms.sendResult(req.user, dto.value as { examId: string });
  }

  @Get('logs') logs(
    @Req() req: AuthenticatedRequest,
    @Query('kind') kind?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.sms.logs(
      req.user,
      kind,
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
    );
  }
}
