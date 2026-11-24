import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReportingModule } from './reporting/reporting.module.js';

@Module({
  imports: [PrismaModule, ReportingModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
