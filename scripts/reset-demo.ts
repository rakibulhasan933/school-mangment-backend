import postgres from 'postgres';

if (process.env.DATABASE_URL === undefined) process.loadEnvFile('.env');
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const queries = [
  "delete from gallery_items where gallery_id in (select id from galleries where school_id = (select id from schools where eiin = '123456'))",
  "delete from service_box_links where service_box_id in (select id from service_boxes where school_id = (select id from schools where eiin = '123456'))",
  "delete from menu_items where menu_id in (select id from menus where school_id = (select id from schools where eiin = '123456'))",
  "delete from marks where school_id = (select id from schools where eiin = '123456')",
  "delete from result_subjects where result_id in (select id from results where school_id = (select id from schools where eiin = '123456'))",
  "delete from exam_subjects where exam_id in (select id from exams where school_id = (select id from schools where eiin = '123456'))",
  "delete from fee_event_classes where fee_event_id in (select id from fee_events where school_id = (select id from schools where eiin = '123456'))",
  "delete from payments where school_id = (select id from schools where eiin = '123456')",
  "delete from student_fees where school_id = (select id from schools where eiin = '123456')",
  "delete from receipts where school_id = (select id from schools where eiin = '123456')",
  "delete from attendance where school_id = (select id from schools where eiin = '123456')",
  "delete from admission_applications where school_id = (select id from schools where eiin = '123456')",
  "delete from results where school_id = (select id from schools where eiin = '123456')",
  "delete from salary_records where school_id = (select id from schools where eiin = '123456')",
  "delete from ledger_entries where school_id = (select id from schools where eiin = '123456')",
  "delete from fee_events where school_id = (select id from schools where eiin = '123456')",
  "delete from routine_entries where school_id = (select id from schools where eiin = '123456')",
  "delete from subject_assignments where school_id = (select id from schools where eiin = '123456')",
  "delete from grading_scales where school_id = (select id from schools where eiin = '123456')",
  "delete from exams where school_id = (select id from schools where eiin = '123456')",
  "delete from admission_settings where school_id = (select id from schools where eiin = '123456')",
  "delete from galleries where school_id = (select id from schools where eiin = '123456')",
  "delete from banners where school_id = (select id from schools where eiin = '123456')",
  "delete from menus where school_id = (select id from schools where eiin = '123456')",
  "delete from service_boxes where school_id = (select id from schools where eiin = '123456')",
  "delete from notices where school_id = (select id from schools where eiin = '123456')",
  "delete from news where school_id = (select id from schools where eiin = '123456')",
  "delete from events where school_id = (select id from schools where eiin = '123456')",
  "delete from downloads where school_id = (select id from schools where eiin = '123456')",
  "delete from important_links where school_id = (select id from schools where eiin = '123456')",
  "delete from quotes where school_id = (select id from schools where eiin = '123456')",
  "delete from messages where school_id = (select id from schools where eiin = '123456')",
  "delete from complaints where school_id = (select id from schools where eiin = '123456')",
  "delete from contact_messages where school_id = (select id from schools where eiin = '123456')",
  "delete from teacher_attendance where school_id = (select id from schools where eiin = '123456')",
  "delete from pages where school_id = (select id from schools where eiin = '123456')",
  "delete from homepage_blocks where school_id = (select id from schools where eiin = '123456')",
  "delete from settings where school_id = (select id from schools where eiin = '123456')",
  "delete from staff where school_id = (select id from schools where eiin = '123456')",
  "delete from students where school_id = (select id from schools where eiin = '123456')",
  "delete from teachers where school_id = (select id from schools where eiin = '123456')",
  "delete from sections where school_id = (select id from schools where eiin = '123456')",
  "delete from subjects where school_id = (select id from schools where eiin = '123456')",
  "delete from academic_classes where school_id = (select id from schools where eiin = '123456')",
  "delete from academic_sessions where school_id = (select id from schools where eiin = '123456')",
  "delete from ledger_categories where school_id = (select id from schools where eiin = '123456')",
  "delete from holidays where school_id = (select id from schools where eiin = '123456')",
  "delete from videos where school_id = (select id from schools where eiin = '123456')",
  "delete from committee_members where school_id = (select id from schools where eiin = '123456')",
  "delete from users where school_id = (select id from schools where eiin = '123456')",
  "delete from schools where eiin = '123456'",
];
async function main() {
  for (const query of queries) await client.unsafe(query);
  console.log('[demo] demo school data reset');
}
main()
  .catch((error: unknown) => {
    console.error(
      `[demo] reset failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    process.exitCode = 1;
  })
  .finally(() => client.end());
