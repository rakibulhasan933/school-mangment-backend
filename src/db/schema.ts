import {
  boolean,
  integer,
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

const contentTimestamps = { createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow() };
export const homepageBlocks = pgTable("homepage_blocks", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), key: text("key").notNull(), titleBn: text("title_bn").notNull(), orderIndex: integer("order_index").notNull().default(0), isEnabled: boolean("is_enabled").notNull().default(true), config: jsonb("config").notNull().default({}), ...contentTimestamps }, (t) => [uniqueIndex("homepage_blocks_school_key_unique").on(t.schoolId, t.key)]);
export const pages = pgTable("pages", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), slug: text("slug").notNull(), titleBn: text("title_bn").notNull(), titleEn: text("title_en"), excerpt: text("excerpt"), body: text("body").notNull().default(""), isPublished: boolean("is_published").notNull().default(false), publishedAt: timestamp("published_at", { withTimezone: true }), ...contentTimestamps }, (t) => [uniqueIndex("pages_school_slug_unique").on(t.schoolId, t.slug)]);
export const menus = pgTable("menus", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), name: text("name").notNull(), isActive: boolean("is_active").notNull().default(true), ...contentTimestamps });
export const menuItems = pgTable("menu_items", { id: uuid("id").primaryKey().defaultRandom(), menuId: uuid("menu_id").notNull().references(() => menus.id), parentId: uuid("parent_id"), labelBn: text("label_bn").notNull(), href: text("href").notNull(), kind: text("kind").notNull().default("page"), orderIndex: integer("order_index").notNull().default(0), isVisible: boolean("is_visible").notNull().default(true), ...contentTimestamps });
export const serviceBoxes = pgTable("service_boxes", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), titleBn: text("title_bn").notNull(), icon: text("icon").notNull().default("grid"), orderIndex: integer("order_index").notNull().default(0), isEnabled: boolean("is_enabled").notNull().default(true), ...contentTimestamps });
export const serviceBoxLinks = pgTable("service_box_links", { id: uuid("id").primaryKey().defaultRandom(), serviceBoxId: uuid("service_box_id").notNull().references(() => serviceBoxes.id), labelBn: text("label_bn").notNull(), href: text("href").notNull(), kind: text("kind").notNull().default("page"), orderIndex: integer("order_index").notNull().default(0), ...contentTimestamps });
export const banners = pgTable("banners", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), imageUrl: text("image_url").notNull(), titleBn: text("title_bn").notNull(), captionBn: text("caption_bn"), href: text("href"), orderIndex: integer("order_index").notNull().default(0), isEnabled: boolean("is_enabled").notNull().default(true), ...contentTimestamps });
export const notices = pgTable("notices", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), titleBn: text("title_bn").notNull(), details: text("details").notNull().default(""), category: text("category").notNull().default("general"), attachmentUrl: text("attachment_url"), isPinned: boolean("is_pinned").notNull().default(false), showTicker: boolean("show_ticker").notNull().default(true), publishAt: timestamp("publish_at", { withTimezone: true }), expiresAt: timestamp("expires_at", { withTimezone: true }), audience: text("audience").notNull().default("public"), audienceClass: text("audience_class"), isPublished: boolean("is_published").notNull().default(false), ...contentTimestamps });
export const news = pgTable("news", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), titleBn: text("title_bn").notNull(), summary: text("summary").notNull().default(""), details: text("details").notNull().default(""), imageUrl: text("image_url"), publishedAt: timestamp("published_at", { withTimezone: true }), isPublished: boolean("is_published").notNull().default(false), ...contentTimestamps });
export const events = pgTable("events", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), titleBn: text("title_bn").notNull(), details: text("details").notNull().default(""), venue: text("venue"), startsAt: timestamp("starts_at", { withTimezone: true }).notNull(), endsAt: timestamp("ends_at", { withTimezone: true }), ...contentTimestamps });
export const galleries = pgTable("galleries", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), titleBn: text("title_bn").notNull(), coverUrl: text("cover_url"), isPublished: boolean("is_published").notNull().default(false), ...contentTimestamps });
export const galleryItems = pgTable("gallery_items", { id: uuid("id").primaryKey().defaultRandom(), galleryId: uuid("gallery_id").notNull().references(() => galleries.id), imageUrl: text("image_url").notNull(), captionBn: text("caption_bn"), orderIndex: integer("order_index").notNull().default(0), ...contentTimestamps });
export const downloads = pgTable("downloads", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), titleBn: text("title_bn").notNull(), category: text("category").notNull().default("general"), fileUrl: text("file_url").notNull(), isPublished: boolean("is_published").notNull().default(false), ...contentTimestamps });
export const importantLinks = pgTable("important_links", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), labelBn: text("label_bn").notNull(), url: text("url").notNull(), orderIndex: integer("order_index").notNull().default(0), isEnabled: boolean("is_enabled").notNull().default(true), ...contentTimestamps });
export const quotes = pgTable("quotes", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), textBn: text("text_bn").notNull(), authorBn: text("author_bn"), isEnabled: boolean("is_enabled").notNull().default(true), ...contentTimestamps });
export const messages = pgTable("messages", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), personNameBn: text("person_name_bn").notNull(), designationBn: text("designation_bn").notNull(), photoUrl: text("photo_url"), body: text("body").notNull(), orderIndex: integer("order_index").notNull().default(0), isEnabled: boolean("is_enabled").notNull().default(true), ...contentTimestamps });
export const contactMessages = pgTable("contact_messages", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), name: text("name").notNull(), mobile: text("mobile").notNull(), email: text("email"), subject: text("subject").notNull(), message: text("message").notNull(), status: text("status").notNull().default("unread"), ...contentTimestamps });
export const complaints = pgTable("complaints", { id: uuid("id").primaryKey().defaultRandom(), schoolId: uuid("school_id").notNull().references(() => schools.id), name: text("name").notNull(), mobile: text("mobile").notNull(), subject: text("subject").notNull(), description: text("description").notNull(), status: text("status").notNull().default("received"), ...contentTimestamps });

export type School = typeof schools.$inferSelect;
export type NewSchool = typeof schools.$inferInsert;
export type User = typeof users.$inferSelect;
export type Setting = typeof settings.$inferSelect;
export type HomepageBlock = typeof homepageBlocks.$inferSelect;
export type Page = typeof pages.$inferSelect;
export type Notice = typeof notices.$inferSelect;
