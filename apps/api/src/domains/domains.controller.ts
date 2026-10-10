import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  type CreateDomainInput,
  createDomainSchema,
  type Domain,
  type DomainDetail,
  type UpdateDomainInput,
  updateDomainSchema,
} from '@coursecraft/shared';
import { Public, Roles } from '../auth/auth.decorators.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { DomainsService } from './domains.service.js';

@Controller('domains')
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Public()
  @Get()
  list(): Promise<Domain[]> {
    return this.domains.list();
  }

  @Public()
  @Get(':slug')
  get(@Param('slug') slug: string): Promise<DomainDetail> {
    return this.domains.getBySlug(slug);
  }

  @Roles('ADMIN')
  @Post()
  create(
    @Body(new ZodValidationPipe(createDomainSchema)) body: CreateDomainInput,
  ): Promise<Domain> {
    return this.domains.create(body);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDomainSchema)) body: UpdateDomainInput,
  ): Promise<Domain> {
    return this.domains.update(id, body);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.domains.remove(id);
  }
}
