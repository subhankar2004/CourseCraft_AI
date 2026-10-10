import { z } from 'zod';

/** URL-safe identifier: lowercase letters, digits and single hyphens (e.g. `database-systems`). */
export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');

/** Turns a name into a slug candidate: "Data Structures & Algorithms" → "data-structures-algorithms". */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

const nameSchema = z.string().trim().min(2, 'Name must be at least 2 characters').max(60);
const descriptionSchema = z.string().trim().max(500).nullable();

/** Card shown in course lists. Only published courses are ever exposed publicly. */
export const courseSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  level: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  lessonCount: z.number().int().nonnegative(),
});

export const domainSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Number of PUBLISHED courses. */
  courseCount: z.number().int().nonnegative(),
});

export const domainDetailSchema = domainSchema.extend({
  courses: z.array(courseSummarySchema),
});

export const createDomainSchema = z.strictObject({
  name: nameSchema,
  description: descriptionSchema.optional(),
  /** Generated from the name when omitted. */
  slug: slugSchema.optional(),
});

export const updateDomainSchema = z
  .strictObject({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    slug: slugSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export type CourseSummary = z.infer<typeof courseSummarySchema>;
export type Domain = z.infer<typeof domainSchema>;
export type DomainDetail = z.infer<typeof domainDetailSchema>;
export type CreateDomainInput = z.infer<typeof createDomainSchema>;
export type UpdateDomainInput = z.infer<typeof updateDomainSchema>;
