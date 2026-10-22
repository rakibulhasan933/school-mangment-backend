CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'TEACHER', 'STUDENT');--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_bn" text NOT NULL,
	"name_en" text NOT NULL,
	"eiin" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"founded_year" text,
	"logo_url" text,
	"theme_color" text DEFAULT '#21699D' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"username" text,
	"email" text,
	"password_hash" text,
	"registration_number" text,
	"display_name_bn" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "schools_eiin_unique" ON "schools" USING btree ("eiin");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_school_key_unique" ON "settings" USING btree ("school_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "users_school_username_unique" ON "users" USING btree ("school_id","username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_school_email_unique" ON "users" USING btree ("school_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_registration_number_unique" ON "users" USING btree ("registration_number");