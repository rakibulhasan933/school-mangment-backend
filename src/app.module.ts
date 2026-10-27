import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { SchoolsModule } from './schools/schools.module.js';
import { ContentModule } from './content/content.module.js';
import { PeopleModule } from './people/people.module.js';
import { AcademicsModule } from './academics/academics.module.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { ResultsModule } from './results/results.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { AdmissionModule } from './admission/admission.module.js';
import { DemoModule } from './demo/demo.module.js';
import { PdfModule } from './pdf/pdf.module.js';
import { SmsModule } from './sms/sms.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    SchoolsModule,
    ContentModule,
    PeopleModule,
    AcademicsModule,
    AttendanceModule,
    ResultsModule,
    FinanceModule,
    AdmissionModule,
    DemoModule,
    PdfModule,
    SmsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
