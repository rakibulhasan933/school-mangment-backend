import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { SchoolsModule } from './schools/schools.module.js';
import { ContentModule } from './content/content.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, SchoolsModule, ContentModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
