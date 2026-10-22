import { Module } from "@nestjs/common";
import { ContentController, PublicContentController } from "./content.controller.js";
import { ContentService } from "./content.service.js";
@Module({ controllers: [ContentController, PublicContentController], providers: [ContentService] })
export class ContentModule {}
