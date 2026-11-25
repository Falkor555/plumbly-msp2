import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Public } from './authentification/public.decorator.js';

/** Route de vérification du démarrage : masquée dans Swagger, ce n'est pas une route métier. */
@Public()
@ApiExcludeController()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
