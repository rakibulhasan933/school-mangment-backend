import { Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { SignJWT, jwtVerify } from 'jose';
import { createDb } from '../db/index.js';
import { students, users } from '../db/schema.js';
import type {
  AccessTokenPayload,
  AuthUser,
  RefreshTokenPayload,
} from './auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';

@Injectable()
export class AuthService {
  private readonly db = createDb();
  private key() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32)
      throw new Error('JWT_SECRET must be at least 32 characters');
    return new TextEncoder().encode(secret);
  }

  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim().toLowerCase();
    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          or(eq(users.email, identifier), eq(users.username, identifier)),
        ),
      )
      .limit(1);
    if (
      !user ||
      user.role === 'STUDENT' ||
      !user.passwordHash ||
      !(await argon2.verify(user.passwordHash, dto.password))
    )
      throw new UnauthorizedException('ইউজারনেম বা পাসওয়ার্ড সঠিক নয়');
    return this.tokens(this.user(user));
  }

  async studentLogin(registrationNumber: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          eq(users.role, 'STUDENT'),
          eq(users.registrationNumber, registrationNumber.trim()),
        ),
      )
      .limit(1);
    if (!user) throw new UnauthorizedException('রেজিস্ট্রেশন নম্বর সঠিক নয়');
    // B1: the token's school must be the school of the student's own
    // record. If the account row's schoolId has drifted from the student
    // row's schoolId (stale account after a re-seed/reset), the portal
    // would query a school where the student has no data at all.
    const [student] = await this.db
      .select({ schoolId: students.schoolId })
      .from(students)
      .where(eq(students.userId, user.id))
      .limit(1);
    const authUser = this.user(user);
    if (student && student.schoolId !== authUser.schoolId)
      authUser.schoolId = student.schoolId;
    return this.tokens(authUser);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.isActive, true)))
      .limit(1);
    if (
      !user?.passwordHash ||
      !(await argon2.verify(user.passwordHash, dto.currentPassword))
    )
      throw new UnauthorizedException('বর্তমান পাসওয়ার্ড সঠিক নয়');
    await this.db
      .update(users)
      .set({
        passwordHash: await argon2.hash(dto.newPassword),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    return { data: { message: 'পাসওয়ার্ড পরিবর্তন হয়েছে' } };
  }

  async resetTeacherPassword(
    adminSchoolId: string,
    teacherId: string,
    newPassword: string,
  ) {
    const [teacher] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, teacherId),
          eq(users.schoolId, adminSchoolId),
          eq(users.role, 'TEACHER'),
        ),
      )
      .limit(1);
    if (!teacher) throw new UnauthorizedException('শিক্ষক পাওয়া যায়নি');
    await this.db
      .update(users)
      .set({
        passwordHash: await argon2.hash(newPassword),
        updatedAt: new Date(),
      })
      .where(eq(users.id, teacherId));
    return { data: { message: 'শিক্ষকের পাসওয়ার্ড রিসেট হয়েছে' } };
  }

  async refresh(refreshToken: string) {
    try {
      const { payload } = await jwtVerify(refreshToken, this.key(), {
        algorithms: ['HS256'],
      });
      const token = payload as unknown as RefreshTokenPayload;
      if (token.tokenType !== 'refresh' || typeof token.sub !== 'string')
        throw new Error('Invalid refresh token');
      const [user] = await this.db
        .select()
        .from(users)
        .where(and(eq(users.id, token.sub), eq(users.isActive, true)))
        .limit(1);
      if (!user) throw new Error('User unavailable');
      return this.tokens(this.user(user));
    } catch {
      throw new UnauthorizedException('রিফ্রেশ টোকেনটি বৈধ নয়');
    }
  }

  private user(user: typeof users.$inferSelect): AuthUser {
    return {
      id: user.id,
      schoolId: user.schoolId,
      role: user.role,
      displayNameBn: user.displayNameBn,
    };
  }
  private async tokens(user: AuthUser) {
    const base = {
      sub: user.id,
      schoolId: user.schoolId,
      role: user.role,
      displayNameBn: user.displayNameBn,
    };
    const accessToken = await new SignJWT({
      ...base,
      tokenType: 'access' satisfies AccessTokenPayload['tokenType'],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(this.key());
    const refreshToken = await new SignJWT({
      ...base,
      tokenType: 'refresh' satisfies RefreshTokenPayload['tokenType'],
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(this.key());
    return { data: { accessToken, refreshToken, user } };
  }
}
