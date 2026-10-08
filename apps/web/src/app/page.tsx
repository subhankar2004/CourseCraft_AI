import { BookOpenIcon, MessageCircleQuestionIcon, MonitorPlayIcon } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Placeholder home page; the real landing page is built in #13.
const steps = [
  {
    icon: MonitorPlayIcon,
    title: 'Ingest',
    description: 'Paste YouTube lectures or a playlist.',
  },
  {
    icon: BookOpenIcon,
    title: 'Structure',
    description: 'AI organises them into Domain → Course → Module → Lesson with study notes.',
  },
  {
    icon: MessageCircleQuestionIcon,
    title: 'Learn & ask',
    description: 'Watch with synced notes and ask a chatbot grounded in the course.',
  },
];

export default function HomePage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">CourseCraft AI</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
        Structured courses from scattered YouTube lectures, with AI study notes and a course-aware
        chatbot.
      </p>
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {steps.map(({ icon: Icon, title, description }) => (
          <Card key={title}>
            <CardHeader>
              <Icon className="size-6 text-primary" aria-hidden />
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
