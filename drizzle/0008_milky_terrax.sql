CREATE TABLE "committee_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name_bn" text NOT NULL,
	"role_bn" text NOT NULL,
	"photo_url" text,
	"order_index" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"title_bn" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"title_bn" text NOT NULL,
	"thumbnail_url" text,
	"video_url" text NOT NULL,
	"published_at" timestamp with time zone,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;