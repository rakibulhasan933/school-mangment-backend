import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as argon2 from "argon2";
import { createDb } from "../src/db/index.js";
import { banners, downloads, events, galleries, galleryItems, homepageBlocks, importantLinks, menuItems, menus, news, notices, pages, schools, serviceBoxes, serviceBoxLinks, settings, users } from "../src/db/schema.js";

if (existsSync(resolve(process.cwd(), ".env"))) process.loadEnvFile(resolve(process.cwd(), ".env"));

type Credentials = { admin: { identifier: string; password: string }; teacher: { identifier: string; password: string }; students: string[] };
const credentialsPath = resolve(process.cwd(), ".demo-credentials.json");

function credentials(): Credentials {
  if (existsSync(credentialsPath)) return JSON.parse(readFileSync(credentialsPath, "utf8")) as Credentials;
  const value: Credentials = { admin: { identifier: "demo-admin", password: randomBytes(18).toString("base64url") }, teacher: { identifier: "demo-teacher", password: randomBytes(18).toString("base64url") }, students: ["26100001", "26100002", "26100003", "26100004", "26100005"] };
  writeFileSync(credentialsPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return value;
}

async function main() {
  const db = createDb();
  const login = credentials();
  let schoolRows: Array<{ id: string }> = [];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try { schoolRows = await db.insert(schools).values({ nameBn: "আদর্শ মডেল উচ্চ বিদ্যালয়", nameEn: "Adarsha Model High School", eiin: "123456", address: "কুড়িগ্রাম সদর, কুড়িগ্রাম", foundedYear: "1985", themeColor: "#21699D" }).onConflictDoUpdate({ target: schools.eiin, set: { nameBn: "আদর্শ মডেল উচ্চ বিদ্যালয়", nameEn: "Adarsha Model High School", address: "কুড়িগ্রাম সদর, কুড়িগ্রাম", foundedYear: "1985", themeColor: "#21699D", updatedAt: new Date() } }).returning({ id: schools.id }); break; } catch (error: unknown) { if (attempt === 5) throw error; await new Promise((resolve) => setTimeout(resolve, attempt * 2000)); }
  }
  const [school] = schoolRows;
  if (!school) throw new Error("Demo school was not created");
  const accountRows = [
    { schoolId: school.id, role: "ADMIN" as const, username: login.admin.identifier, email: "demo-admin@adarsha.test", passwordHash: await argon2.hash(login.admin.password), displayNameBn: "ডেমো প্রশাসক" },
    { schoolId: school.id, role: "TEACHER" as const, username: login.teacher.identifier, email: "demo-teacher@adarsha.test", passwordHash: await argon2.hash(login.teacher.password), displayNameBn: "ডেমো শিক্ষক" },
    ...login.students.map((registrationNumber, index) => ({ schoolId: school.id, role: "STUDENT" as const, registrationNumber, displayNameBn: ["আরিফুল ইসলাম", "সুমাইয়া আক্তার", "রাকিব হাসান", "মিম আক্তার", "তানভীর আহমেদ"][index] ?? `ডেমো শিক্ষার্থী ${index + 1}` })),
  ];
  for (const row of accountRows) {
    if (row.role === "STUDENT") {
      await db.insert(users).values(row).onConflictDoUpdate({ target: users.registrationNumber, set: { schoolId: school.id, role: row.role, registrationNumber: row.registrationNumber, displayNameBn: row.displayNameBn, isActive: true, updatedAt: new Date() } });
    } else {
      await db.insert(users).values(row).onConflictDoUpdate({ target: [users.schoolId, users.email], set: { schoolId: school.id, role: row.role, username: row.username, email: row.email, passwordHash: row.passwordHash, displayNameBn: row.displayNameBn, isActive: true, updatedAt: new Date() } });
    }
  }
  const homepageDefaults = { blocks: ["header", "menu", "ticker", "banner", "notices", "news", "messages", "statistics", "services", "events", "gallery", "links", "downloads", "quotes", "login", "results", "footer"] };
  await db.insert(settings).values({ schoolId: school.id, key: "homepage_blocks", value: homepageDefaults, updatedAt: new Date() }).onConflictDoUpdate({ target: [settings.schoolId, settings.key], set: { value: homepageDefaults, updatedAt: new Date() } });
  const blockNames = ["header", "menu", "ticker", "banner", "notices", "news", "messages", "statistics", "services", "events", "gallery", "links", "downloads", "quotes", "login", "results", "footer"];
  for (const [orderIndex, key] of blockNames.entries()) await db.insert(homepageBlocks).values({ schoolId: school.id, key, titleBn: key, orderIndex, isEnabled: true }).onConflictDoUpdate({ target: [homepageBlocks.schoolId, homepageBlocks.key], set: { orderIndex, isEnabled: true, updatedAt: new Date() } });
  const [menu] = await db.insert(menus).values({ id: "10000000-0000-4000-8000-000000000001", schoolId: school.id, name: "প্রধান মেনু", isActive: true }).onConflictDoNothing().returning();
  const menuId = menu?.id ?? "10000000-0000-4000-8000-000000000001";
  await db.insert(menuItems).values([{ id: "10000000-0000-4000-8000-000000000011", menuId, labelBn: "আমাদের বিদ্যালয়", href: "/about", orderIndex: 1 }, { id: "10000000-0000-4000-8000-000000000012", menuId, labelBn: "বিজ্ঞপ্তি", href: "/notices", orderIndex: 2 }, { id: "10000000-0000-4000-8000-000000000013", menuId, labelBn: "খবর", href: "/news", orderIndex: 3 }, { id: "10000000-0000-4000-8000-000000000014", menuId, labelBn: "যোগাযোগ", href: "/contact", orderIndex: 4 }]).onConflictDoNothing();
  const [service] = await db.insert(serviceBoxes).values({ id: "10000000-0000-4000-8000-000000000002", schoolId: school.id, titleBn: "অনলাইন সেবা", icon: "grid", orderIndex: 0, isEnabled: true }).onConflictDoNothing().returning();
  const serviceId = service?.id ?? "10000000-0000-4000-8000-000000000002";
  await db.insert(serviceBoxLinks).values([{ id: "10000000-0000-4000-8000-000000000021", serviceBoxId: serviceId, labelBn: "ফলাফল অনুসন্ধান", href: "/result-search", orderIndex: 0 }, { id: "10000000-0000-4000-8000-000000000022", serviceBoxId: serviceId, labelBn: "ডাউনলোড", href: "/downloads", orderIndex: 1 }]).onConflictDoNothing();
  await db.insert(pages).values([{ id: "10000000-0000-4000-8000-000000000031", schoolId: school.id, slug: "about", titleBn: "আমাদের বিদ্যালয়", body: "আদর্শ মডেল উচ্চ বিদ্যালয় ১৯৮৫ সাল থেকে কুড়িগ্রাম সদর এলাকার শিক্ষার্থীদের সেবা দিয়ে আসছে।", isPublished: true, publishedAt: new Date() }, { id: "10000000-0000-4000-8000-000000000032", schoolId: school.id, slug: "headteacher-message", titleBn: "প্রধান শিক্ষকের বাণী", body: "শিক্ষা, শৃঙ্খলা ও মানবিক মূল্যবোধ আমাদের অঙ্গীকার।", isPublished: true, publishedAt: new Date() }]).onConflictDoUpdate({ target: [pages.schoolId, pages.slug], set: { isPublished: true, updatedAt: new Date() } });
  await db.insert(banners).values({ id: "10000000-0000-4000-8000-000000000041", schoolId: school.id, imageUrl: "https://placehold.co/1200x450/21699D/FFFFFF?text=Adarsha+Model+High+School", titleBn: "শিক্ষাই জাতির মেরুদণ্ড", captionBn: "আদর্শ মডেল উচ্চ বিদ্যালয়", orderIndex: 0 }).onConflictDoNothing();
  await db.insert(notices).values({ id: "10000000-0000-4000-8000-000000000051", schoolId: school.id, titleBn: "ভর্তি সংক্রান্ত নোটিশ", details: "নতুন শিক্ষাবর্ষের ভর্তি কার্যক্রম শীঘ্রই শুরু হবে।", category: "admission", isPinned: true, showTicker: true, isPublished: true, publishAt: new Date() }).onConflictDoNothing();
  await db.insert(news).values({ id: "10000000-0000-4000-8000-000000000061", schoolId: school.id, titleBn: "বার্ষিক ক্রীড়া প্রতিযোগিতা", summary: "বিদ্যালয়ের বার্ষিক ক্রীড়া প্রতিযোগিতা অনুষ্ঠিত হয়েছে।", details: "শিক্ষার্থীদের অংশগ্রহণে আনন্দঘন পরিবেশে প্রতিযোগিতা অনুষ্ঠিত হয়।", publishedAt: new Date(), isPublished: true }).onConflictDoNothing();
  await db.insert(events).values({ id: "10000000-0000-4000-8000-000000000071", schoolId: school.id, titleBn: "অভিভাবক সমাবেশ", details: "অভিভাবক ও শিক্ষকদের মতবিনিময় সভা।", venue: "বিদ্যালয় মিলনায়তন", startsAt: new Date(Date.now() + 86400000) }).onConflictDoNothing();
  const gallery = await db.insert(galleries).values({ id: "10000000-0000-4000-8000-000000000081", schoolId: school.id, titleBn: "বিদ্যালয় প্রাঙ্গণ", coverUrl: "https://placehold.co/640x360/21699D/FFFFFF?text=Gallery", isPublished: true }).onConflictDoNothing().returning();
  await db.insert(galleryItems).values({ id: "10000000-0000-4000-8000-000000000091", galleryId: gallery[0]?.id ?? "10000000-0000-4000-8000-000000000081", imageUrl: "https://placehold.co/640x360/21699D/FFFFFF?text=School", captionBn: "বিদ্যালয় প্রাঙ্গণ", orderIndex: 0 }).onConflictDoNothing();
  await db.insert(downloads).values({ id: "10000000-0000-4000-8000-0000000000a1", schoolId: school.id, titleBn: "ভর্তি নির্দেশিকা", category: "admission", fileUrl: "https://example.com/admission-guide.pdf", isPublished: true }).onConflictDoNothing();
  await db.insert(importantLinks).values({ id: "10000000-0000-4000-8000-0000000000b1", schoolId: school.id, labelBn: "বাংলাদেশ শিক্ষা বোর্ড", url: "https://educationboardresults.gov.bd", orderIndex: 0, isEnabled: true }).onConflictDoNothing();
  console.log(JSON.stringify({ schoolId: school.id, credentialsPath, studentCount: login.students.length }));
}
main().catch((error: unknown) => { const failure = error as { message?: string; code?: string; detail?: string; constraint?: string }; console.error(JSON.stringify({ message: failure.message ?? "Seed failed", code: failure.code, detail: failure.detail, constraint: failure.constraint })); process.exitCode = 1; });
