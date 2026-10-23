import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
type PdfResponse = {
  status(code: number): PdfResponse;
  json(body: unknown): PdfResponse;
  set(headers: Record<string, string>): PdfResponse;
  send(body: Uint8Array): PdfResponse;
};
import { and, eq } from 'drizzle-orm';
import { createDb } from '../db/index.js';
import { payments, receipts, salaryRecords, schools } from '../db/schema.js';
import { simplePdf } from './pdf.util.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { TenantGuard } from '../auth/tenant.guard.js';

@Controller('public/receipts')
export class ReceiptPdfController {
  private readonly db = createDb();
  @Get(':receiptNumber/pdf') async receipt(
    @Param('receiptNumber') number: string,
    @Query('verifyCode') code: string,
    @Res() response: PdfResponse,
  ) {
    const [row] = await this.db
      .select({ receipt: receipts, payment: payments, school: schools })
      .from(receipts)
      .innerJoin(payments, eq(payments.receiptId, receipts.id))
      .innerJoin(schools, eq(schools.id, receipts.schoolId))
      .where(
        and(eq(receipts.receiptNumber, number), eq(receipts.verifyCode, code)),
      )
      .limit(1);
    if (!row)
      return response.status(404).json({ message: 'রসিদ পাওয়া যায়নি' });
    const pdf = simplePdf('School payment receipt', [
      `School: ${row.school.nameEn}`,
      `Receipt: ${row.receipt.receiptNumber}`,
      `Amount: ${row.payment.amount}`,
      `Date: ${row.payment.paidAt}`,
      `Method: ${row.payment.method}`,
      `Verify code: ${row.receipt.verifyCode}`,
    ]);
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="receipt-${number}.pdf"`,
    });
    return response.send(pdf);
  }
}

@Controller('finance')
export class SalaryPdfController {
  private readonly db = createDb();
  @Get('salary/:id/pdf')
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles('ADMIN', 'TEACHER')
  async salary(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() response: PdfResponse,
  ) {
    const [row] = await this.db
      .select({ salary: salaryRecords, school: schools })
      .from(salaryRecords)
      .innerJoin(schools, eq(schools.id, salaryRecords.schoolId))
      .where(
        and(
          eq(salaryRecords.id, id),
          eq(salaryRecords.schoolId, request.user.schoolId),
        ),
      )
      .limit(1);
    if (!row)
      return response
        .status(404)
        .json({ message: 'বেতন রেকর্ড পাওয়া যায়নি' });
    const pdf = simplePdf('Salary receipt', [
      `School: ${row.school.nameEn}`,
      `Teacher: ${row.salary.teacherId}`,
      `Month: ${row.salary.salaryMonth}`,
      `Basic: ${row.salary.basic}`,
      `Allowances: ${row.salary.allowances}`,
      `Deductions: ${row.salary.deductions}`,
      `Net: ${row.salary.net}`,
      `Paid: ${row.salary.paidAt ?? ''}`,
    ]);
    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="salary-${id}.pdf"`,
    });
    return response.send(pdf);
  }
}
