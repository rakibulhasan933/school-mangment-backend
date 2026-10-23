import { Module } from '@nestjs/common';
import { PeopleController } from './people.controller.js';
import { PeopleService } from './people.service.js';
import {
  PublicStudentsController,
  PublicTeachersController,
} from './public-people.controller.js';
import { StudentPortalController } from './student-portal.controller.js';
import { TeacherPortalController } from './teacher-portal.controller.js';
@Module({
  controllers: [
    PeopleController,
    StudentPortalController,
    TeacherPortalController,
    PublicTeachersController,
    PublicStudentsController,
  ],
  providers: [PeopleService],
})
export class PeopleModule {}
