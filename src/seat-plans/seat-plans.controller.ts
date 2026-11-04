import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { SeatPlansService } from './seat-plans.service.js';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles('ADMIN')
export class SeatPlansController {
  constructor(private readonly service: SeatPlansService) {}
  @Get('rooms') rooms(@Req() r: AuthenticatedRequest) { return this.service.rooms(r.user.schoolId); }
  @Post('rooms') createRoom(@Req() r: AuthenticatedRequest, @Body() b: Parameters<SeatPlansService['createRoom']>[1]) { return this.service.createRoom(r.user, b); }
  @Patch('rooms/:id') updateRoom(@Req() r: AuthenticatedRequest, @Param('id') id: string, @Body() b: Parameters<SeatPlansService['updateRoom']>[2]) { return this.service.updateRoom(r.user, id, b); }
  @Delete('rooms/:id') deleteRoom(@Req() r: AuthenticatedRequest, @Param('id') id: string) { return this.service.deleteRoom(r.user, id); }
  @Post('seat-plans/generate') generate(@Req() r: AuthenticatedRequest, @Body() b: Parameters<SeatPlansService['generateEphemeral']>[1]) { return this.service.generateEphemeral(r.user, b); }
}
