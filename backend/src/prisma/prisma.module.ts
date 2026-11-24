import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// Global : chaque module métier (clients, tournées…) injecte PrismaService sans réimporter ce module.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
