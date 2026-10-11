import type { Metadata } from 'next';
import { GenerateForm } from '@/components/admin/generate-form';

export const metadata: Metadata = { title: 'Generate a course · Admin' };

export default function GenerateCoursePage() {
  return (
    <section className="grid gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Generate a course</h1>
        <p className="text-sm text-muted-foreground">
          Paste YouTube videos or a playlist. CourseCraft fetches the transcripts, writes study
          notes for each video, groups them into modules and saves the course as a draft for review.
        </p>
      </header>
      <GenerateForm />
    </section>
  );
}
