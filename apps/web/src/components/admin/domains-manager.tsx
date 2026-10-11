'use client';

import type { Domain } from '@coursecraft/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { applyApiError } from '@/components/forms/form-errors';
import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { coursesPerDomain } from '@/lib/admin/courses';
import {
  createBody,
  type DomainForm,
  domainFormSchema,
  domainToForm,
  emptyDomainForm,
  updateBody,
} from '@/lib/admin/domains';
import {
  useAdminCourses,
  useCreateDomain,
  useDeleteDomain,
  useDomains,
  useUpdateDomain,
} from '@/lib/admin/hooks';
import { ApiError } from '@/lib/api';

type DialogState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; domain: Domain }
  | { kind: 'delete'; domain: Domain };

export function DomainsManager() {
  const domains = useDomains();
  const courses = useAdminCourses();
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });
  const close = () => setDialog({ kind: 'closed' });
  const totals = courses.data ? coursesPerDomain(courses.data) : undefined;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Subject areas that group courses. Students browse them at{' '}
          <Link href="/domains" className="underline">
            /domains
          </Link>
          .
        </p>
        <Button onClick={() => setDialog({ kind: 'create' })}>
          <PlusIcon aria-hidden />
          New domain
        </Button>
      </div>

      {domains.isPending ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Loading domains">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : domains.isError ? (
        <div role="alert" className="rounded-lg border p-6 text-sm">
          <p>Could not load domains.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void domains.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : domains.data.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No domains yet. Create the first one.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Domains</caption>
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Name
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Slug
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Published
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  All courses
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {domains.data.map((domain) => (
                <tr key={domain.id} className="align-top">
                  <td className="max-w-96 px-3 py-3">
                    <Link href={`/domains/${domain.slug}`} className="font-medium hover:underline">
                      {domain.name}
                    </Link>
                    {domain.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {domain.description}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">{domain.slug}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{domain.courseCount}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {totals ? (totals.get(domain.id) ?? 0) : '…'}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${domain.name}`}
                      onClick={() => setDialog({ kind: 'edit', domain })}
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${domain.name}`}
                      onClick={() => setDialog({ kind: 'delete', domain })}
                    >
                      <Trash2Icon />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={dialog.kind === 'create' || dialog.kind === 'edit'}
        onOpenChange={(open) => !open && close()}
      >
        {(dialog.kind === 'create' || dialog.kind === 'edit') && (
          <DomainDialog
            key={dialog.kind === 'edit' ? dialog.domain.id : 'new'}
            domain={dialog.kind === 'edit' ? dialog.domain : undefined}
            onDone={close}
          />
        )}
      </Dialog>
      <Dialog open={dialog.kind === 'delete'} onOpenChange={(open) => !open && close()}>
        {dialog.kind === 'delete' && (
          <DeleteDialog
            domain={dialog.domain}
            courseCount={totals?.get(dialog.domain.id)}
            onDone={close}
          />
        )}
      </Dialog>
    </div>
  );
}

/** Create (no `domain`) or edit a domain. */
function DomainDialog({ domain, onDone }: { domain?: Domain; onDone: () => void }) {
  const create = useCreateDomain();
  const update = useUpdateDomain();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DomainForm>({
    resolver: zodResolver(domainFormSchema),
    defaultValues: domain ? domainToForm(domain) : emptyDomainForm,
  });

  const onSubmit = handleSubmit(async (form) => {
    try {
      if (!domain) {
        const created = await create.mutateAsync(createBody(form));
        toast.success(`Domain "${created.name}" created`);
      } else {
        const body = updateBody(domain, form);
        if (body) {
          await update.mutateAsync({ domain, body });
          toast.success('Domain updated');
        }
      }
      onDone();
    } catch (error) {
      applyApiError(error, ['name', 'description', 'slug'], setError);
    }
  });

  return (
    <DialogContent>
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{domain ? `Edit ${domain.name}` : 'New domain'}</DialogTitle>
          <DialogDescription>
            {domain
              ? 'Changing the slug changes the domain’s public URL.'
              : 'Leave the slug empty to generate it from the name.'}
          </DialogDescription>
        </DialogHeader>
        {errors.root && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errors.root.message}
          </p>
        )}
        <FormField
          id="domain-name"
          label="Name"
          error={errors.name?.message}
          {...register('name')}
        />
        <div className="grid gap-2">
          <Label htmlFor="domain-description">Description</Label>
          <Textarea
            id="domain-description"
            rows={3}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={errors.description ? 'domain-description-error' : undefined}
            {...register('description')}
          />
          {errors.description && (
            <p id="domain-description-error" className="text-sm text-destructive">
              {errors.description.message}
            </p>
          )}
        </div>
        <FormField
          id="domain-slug"
          label="Slug"
          placeholder={domain ? undefined : 'generated from the name'}
          className="font-mono"
          error={errors.slug?.message}
          {...register('slug')}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : domain ? 'Save changes' : 'Create domain'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function DeleteDialog({
  domain,
  courseCount,
  onDone,
}: {
  domain: Domain;
  courseCount: number | undefined;
  onDone: () => void;
}) {
  const remove = useDeleteDomain();
  const [error, setError] = useState<string | null>(null);
  const blocked = (courseCount ?? 0) > 0;

  const onDelete = async () => {
    setError(null);
    try {
      await remove.mutateAsync(domain);
      toast.success(`Domain "${domain.name}" deleted`);
      onDone();
    } catch (err) {
      // The API is the authority (e.g. a course was added meanwhile: 409 with its reason).
      setError(err instanceof ApiError ? err.message : 'Could not delete the domain.');
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete {domain.name}?</DialogTitle>
        <DialogDescription>
          {blocked
            ? `It still has ${courseCount} course(s). Move or delete them first.`
            : 'This removes the domain and its public page. It cannot be undone.'}
        </DialogDescription>
      </DialogHeader>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={blocked || remove.isPending}
          onClick={() => void onDelete()}
        >
          {remove.isPending ? 'Deleting…' : 'Delete domain'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
