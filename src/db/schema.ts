import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["ADMIN", "TEACHER", "STUDENT"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const schools = pgTable("schools", {
  id: uuid("id").primaryKey().defaultRandom(),
  nameBn: text("name_bn").notNull(),
  nameEn: text("name_en").notNull(),
  eiin: text("eiin").notNull(),
  address: text("address").notNull().default(""),
  foundedYear: text("founded_year"),
  logoUrl: text("logo_url"),
  themeColor: text("theme_color").notNull().default("#21699D"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (table) => [uniqueIndex("schools_eiin_unique").on(table.eiin)]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").notNull().references(() => schools.id),
  role: userRole("role").notNull(),
  username: text("username"),
  email: text("email"),
  passwordHash: text("password_hash"),
  registrationNumber: text("registration_number"),
  displayNameBn: text("display_name_bn").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (table) => [
  uniqueIndex("users_school_username_unique").on(table.schoolId, table.username),
  uniqueIndex("users_school_email_unique").on(table.schoolId, table.email),
  uniqueIndex("users_registration_number_unique").on(table.registrationNumber),
]);

export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").notNull().references(() => schools.id),
  key: text("key").notNull(),
  value: jsonb("value").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("settings_school_key_unique").on(table.schoolId, table.key)]);

export type School = typeof schools.$inferSelect;
export type NewSchool = typeof schools.$inferInsert;
export type User = typeof users.$inferSelect;
export type Setting = typeof settings.$inferSelect;
