import {
  BookOpenTextIcon,
  ClockIcon,
  LayersIcon,
  MessageCircleQuestionIcon,
  MonitorPlayIcon,
  SearchXIcon,
  SparklesIcon,
} from 'lucide-react';
import { Suspense } from 'react';
import { FeaturedDomains, FeaturedDomainsSkeleton } from '@/components/landing/featured-domains';
import { HeroActions } from '@/components/landing/hero-actions';

// Problem and solution follow the project report's abstract (docs/report/CourseCraftAI.pdf).
const problems = [
  {
    icon: SearchXIcon,
    title: 'Scattered content',
    text: 'Great lectures exist on YouTube, but without a clear order it is hard to know what to watch next.',
  },
  {
    icon: ClockIcon,
    title: 'Time lost searching',
    text: 'Beginners spend more time hunting for the right video than actually studying.',
  },
  {
    icon: MonitorPlayIcon,
    title: 'Long videos',
    text: 'Hours-long lectures are hard to revise from; many learners prefer clear, written notes.',
  },
];

const steps = [
  {
    icon: MonitorPlayIcon,
    title: 'Ingest',
    text: 'Pick free YouTube lectures or a playlist. Their transcripts are collected automatically.',
  },
  {
    icon: LayersIcon,
    title: 'Structure',
    text: 'AI organises them into Domain → Course → Module → Lesson and writes study notes linked to video timestamps.',
  },
  {
    icon: MessageCircleQuestionIcon,
    title: 'Learn & ask',
    text: 'Watch with the notes side by side, and ask a chatbot that answers only from the course itself.',
  },
];

const features = [
  {
    icon: LayersIcon,
    title: 'A clear learning path',
    text: 'Every course is broken into ordered modules and lessons, so you always know what comes next.',
  },
  {
    icon: BookOpenTextIcon,
    title: 'Readable study notes',
    text: 'Concise Markdown notes for each lesson, with links that jump to the exact moment in the video.',
  },
  {
    icon: SparklesIcon,
    title: 'A course-aware assistant',
    text: 'Questions are answered from the course content and cite the lesson they came from, instead of guessing.',
  },
];

export default function HomePage() {
  return (
    <>
      <section className="border-b bg-gradient-to-b from-muted/50 to-background">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="text-sm font-medium text-primary">Structured learning from free lectures</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Turn scattered YouTube lectures into structured courses
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground text-pretty">
            CourseCraft AI organises free computer-science content into step-by-step courses, turns
            long videos into easy-to-read study notes, and gives you an assistant that answers from
            the course you are studying.
          </p>
          <div className="mt-8">
            <HeroActions />
          </div>
        </div>
      </section>

      <section aria-labelledby="problem" className="mx-auto max-w-6xl px-4 py-16">
        <h2 id="problem" className="text-2xl font-bold tracking-tight sm:text-3xl">
          Why learning from YouTube is hard
        </h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-3">
          {problems.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Icon className="size-6 text-muted-foreground" aria-hidden />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how" className="border-y bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="how" className="text-2xl font-bold tracking-tight sm:text-3xl">
            How it works
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {steps.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="rounded-xl border bg-background p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <Icon className="size-5 text-primary" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="features" className="mx-auto max-w-6xl px-4 py-16">
        <h2 id="features" className="text-2xl font-bold tracking-tight sm:text-3xl">
          What you get
        </h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Icon className="size-6 text-primary" aria-hidden />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="domains" className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="domains" className="text-2xl font-bold tracking-tight sm:text-3xl">
            Explore domains
          </h2>
          <p className="mt-2 text-muted-foreground">Start with a field that interests you.</p>
          <div className="mt-8">
            <Suspense fallback={<FeaturedDomainsSkeleton />}>
              <FeaturedDomains />
            </Suspense>
          </div>
        </div>
      </section>
    </>
  );
}
