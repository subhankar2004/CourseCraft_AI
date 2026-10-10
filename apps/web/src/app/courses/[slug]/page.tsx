import type { CourseDetail } from '@coursecraft/shared';
import { BookOpenIcon, ClockIcon, LayersIcon, SignalIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CatalogUnavailable } from '@/components/catalog/domain-cards';
import { CourseOutline } from '@/components/course/course-outline';
import { EnrollButton } from '@/components/course/enroll-button';
import { Skeleton } from '@/components/ui/skeleton';
import { getCourse, getCourseSlugsForBuild, UNAVAILABLE } from '@/lib/catalog';
import { formatDuration, plural } from '@/lib/format';

/** Published courses are prerendered; new ones are served via the App Shell (ISR). */
export async function generateStaticParams() {
  const slugs = await getCourseSlugsForBuild();
  // Cache Components needs at least one param; the placeholder renders the not-found page.
  return (slugs.length ? slugs : ['__placeholder__']).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<'/courses/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const course = await getCourse(slug);
  if (!course || course === UNAVAILABLE) return { title: 'Course' };
  const description =
    course.description ??
    `${course.title}: a structured ${course.domain.name} course on CourseCraft AI.`;
  const images = course.thumbnailUrl
    ? [{ url: course.thumbnailUrl, alt: course.title }]
    : undefined;
  return {
    title: course.title,
    description,
    alternates: { canonical: `/courses/${course.slug}` },
    openGraph: {
      type: 'website',
      siteName: 'CourseCraft AI',
      title: course.title,
      description,
      url: `/courses/${course.slug}`,
      images,
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: course.title,
      description,
      images,
    },
  };
}

/** schema.org Course for search engines; `<` is escaped so data can't break out of the script. */
function CourseJsonLd({ course }: { course: CourseDetail }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.title,
    description: course.description ?? undefined,
    educationalLevel: course.level ?? undefined,
    image: course.thumbnailUrl ?? undefined,
    provider: { '@type': 'Organization', name: 'CourseCraft AI' },
    hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'online' },
    isAccessibleForFree: true,
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
    />
  );
}

async function CourseContent({ params }: Pick<PageProps<'/courses/[slug]'>, 'params'>) {
  const course = await getCourse((await params).slug);
  if (course === null) notFound();
  if (course === UNAVAILABLE) return <CatalogUnavailable />;

  const facts = [
    course.level && { icon: SignalIcon, label: course.level },
    { icon: LayersIcon, label: plural(course.modules.length, 'module') },
    { icon: BookOpenIcon, label: plural(course.lessonCount, 'lesson') },
    course.totalVideoSec > 0 && {
      icon: ClockIcon,
      label: `${formatDuration(course.totalVideoSec)} of video`,
    },
  ].filter(Boolean) as { icon: typeof ClockIcon; label: string }[];

  return (
    <>
      <CourseJsonLd course={course} />
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <Link href="/domains" className="hover:text-foreground">
              Domains
            </Link>
            <span aria-hidden> / </span>
            <Link href={`/domains/${course.domain.slug}`} className="hover:text-foreground">
              {course.domain.name}
            </Link>
            <span aria-hidden> / </span>
            <span aria-current="page" className="text-foreground">
              {course.title}
            </span>
          </nav>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {course.title}
          </h1>
          {course.description && (
            <p className="mt-3 max-w-2xl text-lg text-muted-foreground text-pretty">
              {course.description}
            </p>
          )}
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {facts.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-1.5">
                <Icon className="size-4" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <EnrollButton courseSlug={course.slug} />
          </div>
        </div>
        {course.thumbnailUrl && (
          <div className="relative aspect-video overflow-hidden rounded-xl border bg-muted lg:order-last">
            <Image
              src={course.thumbnailUrl}
              alt=""
              fill
              loading="eager"
              sizes="(min-width: 1024px) 360px, 100vw"
              className="object-cover"
            />
          </div>
        )}
      </div>

      <section aria-labelledby="curriculum" className="mt-12">
        <h2 id="curriculum" className="text-2xl font-bold tracking-tight">
          Curriculum
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {plural(course.modules.length, 'module')} · {plural(course.lessonCount, 'lesson')}
        </p>
        <div className="mt-6">
          <CourseOutline modules={course.modules} />
        </div>
      </section>
    </>
  );
}

function CourseSkeleton() {
  return (
    <div className="grid gap-4" aria-label="Loading course">
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-10 w-96 max-w-full" />
      <Skeleton className="h-16 w-full max-w-2xl" />
      <Skeleton className="h-10 w-40" />
      <Skeleton className="mt-8 h-64 w-full rounded-xl" />
    </div>
  );
}

export default function CoursePage({ params }: PageProps<'/courses/[slug]'>) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <Suspense fallback={<CourseSkeleton />}>
        <CourseContent params={params} />
      </Suspense>
    </section>
  );
}
