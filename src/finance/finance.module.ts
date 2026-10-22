import { Module } from '@nestjs/common';
import {
  FinanceController,
  PublicReceiptController,
  StudentFinanceController,
  TeacherFinanceController,
} from './finance.controller.js';
import { FinanceService } from './finance.service.js';
@Module({
  controllers: [
    FinanceController,
    PublicReceiptController,
    StudentFinanceController,
    TeacherFinanceController,
  ],
  providers: [FinanceService],
})
export class FinanceModule {}
