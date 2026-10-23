import { Module } from '@nestjs/common';
import {
  ResultsController,
  PublicExamsController,
  PublicResultsController,
} from './results.controller.js';
import { ResultsService } from './results.service.js';
@Module({
  controllers: [ResultsController, PublicResultsController, PublicExamsController],
  providers: [ResultsService],
})
export class ResultsModule {}
