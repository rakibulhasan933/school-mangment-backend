import { Module } from '@nestjs/common';
import { SmsController } from './sms.controller.js';
import { SmsService } from './sms.service.js';

@Module({
  controllers: [SmsController],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsModule {}
