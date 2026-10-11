'use client';

import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon, PlusIcon } from 'lucide-react';
import type { AdminCourseDetail } from '@coursecraft/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { formatDuration } from '@/lib/format';
import {
  addModule,
  type DraftModule,
  type DraftOutline,
  moveLessonTo,
  moveLessonWithin,
  moveModule,
  renameModule,
} from '@/lib/admin/outline';
import { cn } from '@/lib/utils';

type Lesson = AdminCourseDetail['modules'][number]['lessons'][number];

interface Props {
  draft: DraftOutline;
  onChange: (next: DraftOutline) => void;
  lessons: ReadonlyMap<string, Lesson>;
  disabled: boolean;
  onPreview: (lessonId: string) => void;
}

const moduleDragId = (key: string) => `module:${key}`;
const lessonDragId = (id: string) => `lesson:${id}`;

/**
 * The course outline as nested sortable lists: drag a handle (or focus it and use Space and the
 * arrow keys), or use the move buttons. Lessons move between modules with "Move to module…".
 */
export function OutlineEditor({ draft, onChange, lessons, disabled, onPreview }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Screen readers hear titles and positions, not internal ids.
  const describe = (id: string | number) => {
    const key = String(id);
    if (key.startsWith('module:')) {
      const index = draft.findIndex((m) => moduleDragId(m.key) === key);
      return `module ${index + 1}, ${draft[index]?.title || 'untitled'}`;
    }
    const lessonId = key.slice('lesson:'.length);
    const group = draft.find((m) => m.lessonIds.includes(lessonId));
    const position = (group?.lessonIds.indexOf(lessonId) ?? 0) + 1;
    return `lesson ${position}, ${lessons.get(lessonId)?.title ?? 'untitled'}`;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${describe(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${describe(active.id)} is over ${describe(over.id)}.`
        : `${describe(active.id)} is not over a valid position.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${describe(active.id)} was dropped at ${describe(over.id)}.`
        : `${describe(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving ${describe(active.id)} was cancelled.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = active.data.current as { type: 'module' } | { type: 'lesson'; moduleKey: string };
    const to = over.data.current as
      { type: 'module' } | { type: 'lesson'; moduleKey: string } | undefined;
    if (from.type === 'module' && to?.type === 'module') {
      const keys = draft.map((m) => moduleDragId(m.key));
      onChange(moveModule(draft, keys.indexOf(String(active.id)), keys.indexOf(String(over.id))));
    } else if (from.type === 'lesson' && to?.type === 'lesson' && to.moduleKey === from.moduleKey) {
      const group = draft.find((m) => m.key === from.moduleKey)!;
      const ids = group.lessonIds.map(lessonDragId);
      onChange(
        moveLessonWithin(
          draft,
          group.key,
          ids.indexOf(String(active.id)),
          ids.indexOf(String(over.id)),
        ),
      );
    }
  };

  return (
    <div className="grid gap-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'To reorder, press Space to pick this item up, use the up and down arrow keys to move it, then Space again to drop it, or Escape to cancel. Lessons stay within their module; use “Move to module” to change module.',
          },
        }}
      >
        <SortableContext
          items={draft.map((m) => moduleDragId(m.key))}
          strategy={verticalListSortingStrategy}
        >
          <ol className="grid gap-3" aria-label="Modules">
            {draft.map((module, index) => (
              <ModuleCard
                key={module.key}
                module={module}
                index={index}
                draft={draft}
                lessons={lessons}
                disabled={disabled}
                onChange={onChange}
                onPreview={onPreview}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(addModule(draft))}
        >
          <PlusIcon aria-hidden />
          Add module
        </Button>
      </div>
    </div>
  );
}

function ModuleCard({
  module,
  index,
  draft,
  lessons,
  disabled,
  onChange,
  onPreview,
}: {
  module: DraftModule;
  index: number;
  draft: DraftOutline;
  lessons: ReadonlyMap<string, Lesson>;
  disabled: boolean;
  onChange: (next: DraftOutline) => void;
  onPreview: (lessonId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: moduleDragId(module.key), data: { type: 'module' }, disabled });
  const minutes = module.lessonIds.reduce(
    (sum, id) => sum + (lessons.get(id)?.videoDurationSec ?? 0),
    0,
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('rounded-xl border bg-card', isDragging && 'relative z-10 shadow-lg')}
    >
      <div className="flex items-center gap-2 border-b p-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted disabled:cursor-not-allowed"
          aria-label={`Drag module ${index + 1}`}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <span className="w-6 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
        <Input
          value={module.title}
          aria-label={`Title of module ${index + 1}`}
          disabled={disabled}
          className="h-7 flex-1 font-medium"
          onChange={(event) => onChange(renameModule(draft, module.key, event.target.value))}
        />
        <span className="hidden text-xs whitespace-nowrap text-muted-foreground sm:inline">
          {module.lessonIds.length} lesson{module.lessonIds.length === 1 ? '' : 's'}
          {minutes > 0 && ` · ${formatDuration(minutes)}`}
        </span>
        <MoveButtons
          label={`module ${index + 1}`}
          disabled={disabled}
          canUp={index > 0}
          canDown={index < draft.length - 1}
          onMove={(delta) => onChange(moveModule(draft, index, index + delta))}
        />
      </div>
      {module.lessonIds.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">
          Empty. Move lessons here with “Move to module…”, or it is removed when you save.
        </p>
      ) : (
        <SortableContext
          items={module.lessonIds.map(lessonDragId)}
          strategy={verticalListSortingStrategy}
        >
          <ol
            className="divide-y"
            aria-label={`Lessons of ${module.title || `module ${index + 1}`}`}
          >
            {module.lessonIds.map((lessonId, lessonIndex) => (
              <LessonRow
                key={lessonId}
                lesson={lessons.get(lessonId)}
                lessonId={lessonId}
                lessonIndex={lessonIndex}
                module={module}
                draft={draft}
                disabled={disabled}
                onChange={onChange}
                onPreview={onPreview}
              />
            ))}
          </ol>
        </SortableContext>
      )}
    </li>
  );
}

function LessonRow({
  lesson,
  lessonId,
  lessonIndex,
  module,
  draft,
  disabled,
  onChange,
  onPreview,
}: {
  lesson: Lesson | undefined;
  lessonId: string;
  lessonIndex: number;
  module: DraftModule;
  draft: DraftOutline;
  disabled: boolean;
  onChange: (next: DraftOutline) => void;
  onPreview: (lessonId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: lessonDragId(lessonId),
    data: { type: 'lesson', moduleKey: module.key },
    disabled,
  });
  const title = lesson?.title ?? lessonId;
  const others = draft.filter((m) => m.key !== module.key);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 bg-card px-2 py-1.5 text-sm',
        isDragging && 'relative z-10 shadow-md',
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted disabled:cursor-not-allowed"
        aria-label={`Drag lesson ${title}`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-3.5" />
      </button>
      <span className="w-6 text-xs text-muted-foreground tabular-nums">{lessonIndex + 1}</span>
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left hover:underline"
        onClick={() => onPreview(lessonId)}
        title="Preview the lesson"
      >
        {title}
      </button>
      {lesson && (
        <span className="hidden text-xs whitespace-nowrap text-muted-foreground sm:inline">
          {formatDuration(lesson.videoDurationSec)}
          {lesson.readingTimeMin ? ` · ${lesson.readingTimeMin} min read` : ''}
        </span>
      )}
      {others.length > 0 && (
        <NativeSelect
          aria-label={`Move ${title} to another module`}
          className="h-7 w-36 text-xs md:text-xs"
          disabled={disabled}
          value=""
          onChange={(event) => onChange(moveLessonTo(draft, lessonId, event.target.value))}
        >
          <option value="">Move to module…</option>
          {others.map((m) => (
            <option key={m.key} value={m.key}>
              {m.title || 'Untitled module'}
            </option>
          ))}
        </NativeSelect>
      )}
      <MoveButtons
        label={title}
        disabled={disabled}
        canUp={lessonIndex > 0}
        canDown={lessonIndex < module.lessonIds.length - 1}
        onMove={(delta) =>
          onChange(moveLessonWithin(draft, module.key, lessonIndex, lessonIndex + delta))
        }
      />
    </li>
  );
}

function MoveButtons({
  label,
  disabled,
  canUp,
  canDown,
  onMove,
}: {
  label: string;
  disabled: boolean;
  canUp: boolean;
  canDown: boolean;
  onMove: (delta: -1 | 1) => void;
}) {
  return (
    <span className="flex shrink-0">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Move ${label} up`}
        disabled={disabled || !canUp}
        onClick={() => onMove(-1)}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Move ${label} down`}
        disabled={disabled || !canDown}
        onClick={() => onMove(1)}
      >
        <ArrowDownIcon />
      </Button>
    </span>
  );
}
