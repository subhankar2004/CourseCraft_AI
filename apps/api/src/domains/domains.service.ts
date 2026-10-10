import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type CreateDomainInput,
  type Domain,
  type DomainDetail,
  slugify,
  type UpdateDomainInput,
} from '@coursecraft/shared';
import { courseSummarySelect, PUBLISHED, toCourseSummary } from '../courses/course-summary.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const domainWithCount = {
  id: true,
  slug: true,
  name: true,
  description: true,
  _count: { select: { courses: { where: PUBLISHED } } },
} satisfies Prisma.DomainSelect;

type DomainRow = Prisma.DomainGetPayload<{ select: typeof domainWithCount }>;

function toDomain({ _count, ...domain }: DomainRow): Domain {
  return { ...domain, courseCount: _count.courses };
}

@Injectable()
export class DomainsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Domain[]> {
    const rows = await this.prisma.domain.findMany({
      select: domainWithCount,
      orderBy: { name: 'asc' },
    });
    return rows.map(toDomain);
  }

  /** A domain and its PUBLISHED courses (drafts are never exposed publicly). */
  async getBySlug(slug: string): Promise<DomainDetail> {
    const row = await this.prisma.domain.findUnique({
      where: { slug },
      select: {
        ...domainWithCount,
        courses: {
          where: PUBLISHED,
          orderBy: { title: 'asc' },
          select: courseSummarySelect,
        },
      },
    });
    if (!row) throw new NotFoundException(`Domain "${slug}" not found`);

    const { courses, ...domain } = row;
    return {
      ...toDomain(domain),
      courses: courses.map(toCourseSummary),
    };
  }

  async create(input: CreateDomainInput): Promise<Domain> {
    await this.assertNameAvailable(input.name);
    const slug = input.slug ?? (await this.uniqueSlugFrom(input.name));
    try {
      const row = await this.prisma.domain.create({
        data: { name: input.name, slug, description: input.description ?? null },
        select: domainWithCount,
      });
      return toDomain(row);
    } catch (error) {
      throw this.mapUniqueViolation(error, slug);
    }
  }

  async update(id: string, input: UpdateDomainInput): Promise<Domain> {
    await this.findOrThrow(id);
    if (input.name) await this.assertNameAvailable(input.name, id);
    try {
      const row = await this.prisma.domain.update({
        where: { id },
        data: input, // the slug only changes when explicitly given (URLs stay stable)
        select: domainWithCount,
      });
      return toDomain(row);
    } catch (error) {
      throw this.mapUniqueViolation(error, input.slug);
    }
  }

  /** Refuses while any course (published or not) still belongs to the domain. */
  async remove(id: string): Promise<void> {
    const domain = await this.findOrThrow(id);
    const courses = await this.prisma.course.count({ where: { domainId: id } });
    if (courses > 0) {
      throw new ConflictException(
        `Domain "${domain.name}" still has ${courses} course(s). Move or delete them first.`,
      );
    }
    try {
      await this.prisma.domain.delete({ where: { id } });
    } catch (error) {
      // A course was added between the check and the delete; the FK (RESTRICT) caught it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException(`Domain "${domain.name}" still has courses.`);
      }
      throw error;
    }
  }

  private async findOrThrow(id: string) {
    const domain = await this.prisma.domain.findUnique({ where: { id } });
    if (!domain) throw new NotFoundException('Domain not found');
    return domain;
  }

  private async assertNameAvailable(name: string, exceptId?: string): Promise<void> {
    const clash = await this.prisma.domain.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        // When updating, a domain may keep its own name.
        ...(exceptId && { NOT: { id: exceptId } }),
      },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`A domain named "${name}" already exists`);
  }

  /** "Web Development" → "web-development", or "web-development-2" if taken. */
  private async uniqueSlugFrom(name: string): Promise<string> {
    const base = slugify(name) || 'domain';
    const taken = new Set(
      (
        await this.prisma.domain.findMany({
          where: { slug: { startsWith: base } },
          select: { slug: true },
        })
      ).map((d) => d.slug),
    );
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  private mapUniqueViolation(error: unknown, slug: string | undefined): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException(`The slug "${slug}" is already in use`);
    }
    return error;
  }
}
