import type { userRole } from "../db/schema.js";

export type UserRole = (typeof userRole.enumValues)[number];

export type AuthUser = {
  id: string;
  schoolId: string;
  role: UserRole;
  displayNameBn: string;
};

export type AccessTokenPayload = {
  sub: string;
  schoolId: string;
  role: UserRole;
  displayNameBn: string;
  tokenType: "access";
};

export type RefreshTokenPayload = {
  sub: string;
  schoolId: string;
  role: UserRole;
  tokenType: "refresh";
};
