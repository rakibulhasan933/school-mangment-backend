CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name_bn" text NOT NULL,
	"building" text,
	"floor" text,
	"bench_rows" integer NOT NULL,
	"bench_columns" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seat_plan_id" uuid NOT NULL,
	"seat_plan_room_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"seat_no" integer NOT NULL,
	"bench_row" integer NOT NULL,
	"bench_column" integer NOT NULL,
	"bench_slot" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat_plan_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seat_plan_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"exam_subject_id" uuid,
	"status" text DEFAULT 'approved' NOT NULL,
	"exclude_reason" text,
	"is_manual_add" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat_plan_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seat_plan_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"room_teacher_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat_plan_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seat_plan_id" uuid NOT NULL,
	"exam_subject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seat_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sitting_date" text NOT NULL,
	"shift" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"pattern" text DEFAULT 'serial' NOT NULL,
	"room_mode" text DEFAULT 'mixed' NOT NULL,
	"per_bench" integer DEFAULT 1 NOT NULL,
	"fee_event_id" uuid,
	"eligibility_source" text DEFAULT 'all' NOT NULL,
	"source_exam_id" uuid,
	"selected_sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_seat_plan_id_seat_plans_id_fk" FOREIGN KEY ("seat_plan_id") REFERENCES "public"."seat_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_seat_plan_room_id_seat_plan_rooms_id_fk" FOREIGN KEY ("seat_plan_room_id") REFERENCES "public"."seat_plan_rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_plan_candidates" ADD CONSTRAINT "seat_plan_candidates_seat_plan_id_seat_plans_id_fk" FOREIGN KEY ("seat_plan_id") REFERENCES "public"."seat_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_plan_candidates" ADD CONSTRAINT "seat_plan_candidates_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_plan_candidates" ADD CONSTRAINT "seat_plan_candidates_exam_subject_id_exam_subjects_id_fk" FOREIGN KEY ("exam_subject_id") REFERENCES "public"."exam_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_plan_rooms" ADD CONSTRAINT "seat_plan_rooms_seat_plan_id_seat_plans_id_fk" FOREIGN KEY ("seat_plan_id") REFERENCES "public"."seat_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_plan_rooms" ADD CONSTRAINT "seat_plan_rooms_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_plan_subjects" ADD CONSTRAINT "seat_plan_subjects_seat_plan_id_seat_plans_id_fk" FOREIGN KEY ("seat_plan_id") REFERENCES "public"."seat_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_plan_subjects" ADD CONSTRAINT "seat_plan_subjects_exam_subject_id_exam_subjects_id_fk" FOREIGN KEY ("exam_subject_id") REFERENCES "public"."exam_subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_plans" ADD CONSTRAINT "seat_plans_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_plans" ADD CONSTRAINT "seat_plans_fee_event_id_fee_events_id_fk" FOREIGN KEY ("fee_event_id") REFERENCES "public"."fee_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_plans" ADD CONSTRAINT "seat_plans_source_exam_id_exams_id_fk" FOREIGN KEY ("source_exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seat_assignments_plan_student_unique" ON "seat_assignments" USING btree ("seat_plan_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_assignments_room_seat_unique" ON "seat_assignments" USING btree ("seat_plan_room_id","seat_no");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_plan_candidates_unique" ON "seat_plan_candidates" USING btree ("seat_plan_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_plan_rooms_unique" ON "seat_plan_rooms" USING btree ("seat_plan_id","room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seat_plan_subjects_unique" ON "seat_plan_subjects" USING btree ("seat_plan_id","exam_subject_id");