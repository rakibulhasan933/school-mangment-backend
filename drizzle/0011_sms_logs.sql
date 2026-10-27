CREATE TABLE "sms_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"kind" text DEFAULT 'manual' NOT NULL,
	"recipient_name" text,
	"mobile" text NOT NULL,
	"message" text NOT NULL,
	"segments" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'test' NOT NULL,
	"provider_response" text,
	"sent_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;