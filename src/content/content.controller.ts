import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ContentService } from './content.service.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';
import { ContentMutationDto } from './dto/content-mutation.dto.js';
import { PublicMessageDto } from './dto/public-message.dto.js';

@Controller('content')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}
  @Get(':resource') @Roles('ADMIN') list(
    @Param('resource') resource: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.content.list(resource, request.user.schoolId);
  }
  @Post(':resource') @Roles('ADMIN') create(
    @Param('resource') resource: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    return this.content.create(resource, request.user, dto.value);
  }
  @Patch(':resource/:id') @Roles('ADMIN') update(
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    return this.content.update(resource, request.user, id, dto.value);
  }
  @Delete(':resource/:id') @Roles('ADMIN') remove(
    @Param('resource') resource: string,
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.content.remove(resource, request.user, id);
  }
  @Get(':parent/:parentId/items') @Roles('ADMIN') children(
    @Param('parent') parent: 'menus' | 'serviceBoxes' | 'galleries',
    @Param('parentId') parentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const kind =
      parent === 'menus'
        ? 'menuItems'
        : parent === 'serviceBoxes'
          ? 'serviceBoxLinks'
          : 'galleryItems';
    return this.content.children(kind, parentId, request.user.schoolId);
  }
  @Post(':parent/:parentId/items') @Roles('ADMIN') createChild(
    @Param('parent') parent: 'menus' | 'serviceBoxes' | 'galleries',
    @Param('parentId') parentId: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    const kind =
      parent === 'menus'
        ? 'menuItems'
        : parent === 'serviceBoxes'
          ? 'serviceBoxLinks'
          : 'galleryItems';
    return this.content.createChild(kind, parentId, request.user, dto.value);
  }
  @Patch(':parent/:parentId/items/:id') @Roles('ADMIN') updateChild(
    @Param('parent') parent: 'menus' | 'serviceBoxes' | 'galleries',
    @Param('parentId') parentId: string,
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: ContentMutationDto,
  ) {
    const kind =
      parent === 'menus'
        ? 'menuItems'
        : parent === 'serviceBoxes'
          ? 'serviceBoxLinks'
          : 'galleryItems';
    return this.content.updateChild(
      kind,
      parentId,
      id,
      request.user,
      dto.value,
    );
  }
  @Delete(':parent/:parentId/items/:id') @Roles('ADMIN') removeChild(
    @Param('parent') parent: 'menus' | 'serviceBoxes' | 'galleries',
    @Param('parentId') parentId: string,
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const kind =
      parent === 'menus'
        ? 'menuItems'
        : parent === 'serviceBoxes'
          ? 'serviceBoxLinks'
          : 'galleryItems';
    return this.content.removeChild(kind, parentId, id, request.user);
  }
}

@Controller('public/content')
export class PublicContentController {
  constructor(private readonly content: ContentService) {}
  @Get('home') home(@Query('schoolId') schoolId?: string) {
    return this.content.home(schoolId ?? process.env.DEFAULT_SCHOOL_ID ?? '');
  }
  @Get('news/:id') newsDetail(
    @Param('id') id: string,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.content.publicOne(
      'news',
      schoolId ?? process.env.DEFAULT_SCHOOL_ID ?? '',
      id,
    );
  }
  @Get(':resource') list(
    @Param('resource') resource: string,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.content.publicList(
      resource,
      schoolId ?? process.env.DEFAULT_SCHOOL_ID ?? '',
    );
  }
  @Post('contact-messages') contact(
    @Query('schoolId') schoolId: string | undefined,
    @Body() dto: PublicMessageDto,
  ) {
    return this.content.publicMessage(
      'contactMessages',
      schoolId ?? process.env.DEFAULT_SCHOOL_ID ?? '',
      {
        name: dto.name,
        mobile: dto.mobile,
        email: dto.email,
        subject: dto.subject,
        message: dto.message ?? dto.description ?? '',
      },
    );
  }
  @Post('complaints') complaint(
    @Query('schoolId') schoolId: string | undefined,
    @Body() dto: PublicMessageDto,
  ) {
    return this.content.publicMessage(
      'complaints',
      schoolId ?? process.env.DEFAULT_SCHOOL_ID ?? '',
      {
        name: dto.name,
        mobile: dto.mobile,
        subject: dto.subject,
        description: dto.description ?? dto.message ?? '',
      },
    );
  }
}
