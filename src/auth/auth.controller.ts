import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { RefreshTokenDto } from "./dto/refresh-token.dto.js";
import { StudentLoginDto } from "./dto/student-login.dto.js";
import { ChangePasswordDto } from "./dto/change-password.dto.js";
import { JwtAuthGuard, type AuthenticatedRequest } from "./jwt-auth.guard.js";
import { Roles } from "./roles.decorator.js";
import { RolesGuard } from "./roles.guard.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post("login") login(@Body() dto: LoginDto) { return this.auth.login(dto); }
  @Post("student-login") studentLogin(@Body() dto: StudentLoginDto) { return this.auth.studentLogin(dto.registrationNumber); }
  @Post("refresh") refresh(@Body() dto: RefreshTokenDto) { return this.auth.refresh(dto.refreshToken); }
  @Post("change-password") @UseGuards(JwtAuthGuard, RolesGuard) @Roles("ADMIN", "TEACHER") changePassword(@Req() request: AuthenticatedRequest, @Body() dto: ChangePasswordDto) { return this.auth.changePassword(request.user.id, dto); }
}
