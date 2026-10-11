'use client';

import { ListVideoIcon, ListIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { applyApiError } from '@/components/forms/form-errors';
import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  buildGenerateBody,
  type GenerateFormValues,
  parseVideoLines,
  type SourceMode,
} from '@/lib/admin/generate';
import { useDomains, useGenerateCourse } from '@/lib/admin/hooks';
import { plural } from '@/lib/format';
import { cn } from '@/lib/utils';

const SELECT_CLASS =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30';

export function GenerateForm() {
  const router = useRouter();
  const domains = useDomains();
  const generate = useGenerateCourse();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<GenerateFormValues>({
    defaultValues: { domainId: '', mode: 'videos', urlsText: '', playlistUrl: '', titleHint: '' },
  });
  // useWatch, not watch(): it subscribes like a hook, so the React Compiler can optimise this form.
  const mode = useWatch({ control, name: 'mode' });
  const preview = parseVideoLines(useWatch({ control, name: 'urlsText' }));

  const onSubmit = handleSubmit(async (values) => {
    const result = buildGenerateBody(values);
    if ('errors' in result) {
      for (const [field, message] of Object.entries(result.errors)) {
        setError(field as keyof GenerateFormValues, { message });
      }
      return;
    }
    try {
      const { jobId } = await generate.mutateAsync(result.body);
      router.push(`/admin/jobs/${jobId}`);
    } catch (error) {
      // URLs were validated here already; anything the API still rejects is shown on top.
      applyApiError(error, ['domainId', 'playlistUrl', 'titleHint'], setError);
    }
  });

  const chooseMode = (next: SourceMode) => setValue('mode', next);

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-2xl gap-5">
      {errors.root && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errors.root.message}
        </p>
      )}

      <div className="grid gap-2">
        <Label htmlFor="domainId">Domain</Label>
        {domains.isPending ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <select
            id="domainId"
            className={SELECT_CLASS}
            aria-invalid={Boolean(errors.domainId)}
            aria-describedby={errors.domainId ? 'domainId-error' : undefined}
            {...register('domainId')}
          >
            <option value="">Choose a domain…</option>
            {domains.data?.map((domain) => (
              <option key={domain.id} value={domain.id}>
                {domain.name}
              </option>
            ))}
          </select>
        )}
        {errors.domainId && (
          <p id="domainId-error" className="text-sm text-destructive">
            {errors.domainId.message}
          </p>
        )}
      </div>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-sm font-medium">Videos</legend>
        <div role="radiogroup" aria-label="Source" className="flex gap-2">
          {(
            [
              ['videos', 'Video URLs', ListIcon],
              ['playlist', 'Playlist URL', ListVideoIcon],
            ] as const
          ).map(([value, label, Icon]) => (
            <Button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              variant={mode === value ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => chooseMode(value)}
            >
              <Icon aria-hidden />
              {label}
            </Button>
          ))}
        </div>

        {mode === 'videos' ? (
          <div className="grid gap-2">
            <Label htmlFor="urlsText">One YouTube video URL per line</Label>
            <Textarea
              id="urlsText"
              rows={6}
              spellCheck={false}
              placeholder={'https://www.youtube.com/watch?v=…\nhttps://youtu.be/…'}
              className="font-mono text-xs md:text-xs"
              aria-invalid={Boolean(errors.urlsText)}
              aria-describedby="urlsText-help urlsText-error"
              {...register('urlsText')}
            />
            <p id="urlsText-help" className="text-xs text-muted-foreground" aria-live="polite">
              {preview.urls.length === 0 && preview.problems.length === 0
                ? 'Lessons follow the order of the lines.'
                : `${plural(preview.urls.length, 'video')} ready` +
                  (preview.duplicates
                    ? `, ${plural(preview.duplicates, 'duplicate')} ignored`
                    : '') +
                  (preview.problems.length
                    ? `, ${plural(preview.problems.length, 'line')} to fix`
                    : '')}
            </p>
            {errors.urlsText && (
              <p id="urlsText-error" className="text-sm whitespace-pre-line text-destructive">
                {errors.urlsText.message}
              </p>
            )}
          </div>
        ) : (
          <FormField
            id="playlistUrl"
            label="Playlist URL"
            placeholder="https://www.youtube.com/playlist?list=…"
            className="font-mono text-xs md:text-xs"
            error={errors.playlistUrl?.message}
            {...register('playlistUrl')}
          />
        )}
      </fieldset>

      <FormField
        id="titleHint"
        label="Title hint (optional)"
        placeholder="Used only if the AI can't propose a title"
        error={errors.titleHint?.message}
        {...register('titleHint')}
      />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Starting…' : 'Generate course'}
        </Button>
        <p className={cn('text-xs text-muted-foreground')}>
          Runs in the background; a few minutes per hour of video on a local model.
        </p>
      </div>
    </form>
  );
}
