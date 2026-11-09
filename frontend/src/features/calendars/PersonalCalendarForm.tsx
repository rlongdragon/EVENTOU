import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../auth/api';
import {
  fetchCategoryCalendars,
  fetchEventTags,
  type CategoryCalendar,
  type PersonalCalendarInput,
} from './api';

const errorStyle = { color: '#cf222e', margin: 0 } as const;
const fieldsetStyle = { display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1rem' } as const;

/** 「其他標籤」欄位以逗號（含全形、頓號）分隔。 */
function splitTags(value: string): string[] {
  return value
    .split(/[,，、]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** US-09 建立或編輯個人行事曆的表單：名稱、類別（複選）與標籤（複選，可自行輸入）。 */
export function PersonalCalendarForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: PersonalCalendarInput;
  submitLabel: string;
  /** 送出失敗時 reject（ApiError 的 fields 會顯示在對應欄位） */
  onSubmit: (input: PersonalCalendarInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [categoryOptions, setCategoryOptions] = useState<CategoryCalendar[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState(initial?.name ?? '');
  const [categories, setCategories] = useState<string[]>(initial?.categories ?? []);
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [extraTags, setExtraTags] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetchCategoryCalendars(controller.signal), fetchEventTags(controller.signal)])
      .then(([loadedCategories, loadedTags]) => {
        setCategoryOptions(loadedCategories);
        setKnownTags(loadedTags);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setLoadError(String(error));
      });
    return () => controller.abort();
  }, []);

  // 已選但目前沒有活動使用的標籤也要列出來，才能取消勾選
  const tagOptions = [...new Set([...knownTags, ...tags])].sort();

  function toggle(list: string[], value: string, checked: boolean): string[] {
    return checked ? [...list, value] : list.filter((item) => item !== value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      name: name.trim(),
      categories,
      tags: [...new Set([...tags, ...splitTags(extraTags)])],
    };
    const localErrors: Record<string, string> = {};
    if (!input.name) localErrors.name = '請輸入行事曆名稱';
    if (input.categories.length === 0 && input.tags.length === 0) {
      localErrors.categories = '請至少選擇一個類別或標籤';
    }
    setErrors(localErrors);
    if (Object.keys(localErrors).length > 0) return;

    setSubmitting(true);
    try {
      await onSubmit(input);
    } catch (error) {
      setErrors(
        error instanceof ApiError
          ? { ...error.fields, form: Object.keys(error.fields).length ? '' : error.message }
          : { form: '無法連線到伺服器，請稍後再試' },
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '36rem' }}
    >
      {loadError && <p role="alert">無法載入類別或標籤：{loadError}</p>}
      <label>
        名稱{' '}
        <input
          type="text"
          value={name}
          maxLength={50}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors.name ? true : undefined}
        />
      </label>
      {errors.name && <p style={errorStyle}>{errors.name}</p>}

      <fieldset style={fieldsetStyle}>
        <legend>類別（可複選，符合任一類別）</legend>
        {categoryOptions.map((option) => (
          <label key={option.category}>
            <input
              type="checkbox"
              checked={categories.includes(option.category)}
              onChange={(event) =>
                setCategories(toggle(categories, option.category, event.target.checked))
              }
            />{' '}
            {option.label}
          </label>
        ))}
      </fieldset>
      {errors.categories && <p style={errorStyle}>{errors.categories}</p>}

      <fieldset style={fieldsetStyle}>
        <legend>標籤（可複選，符合任一標籤）</legend>
        {tagOptions.length === 0 && <span>目前的活動還沒有標籤，可在下方自行輸入。</span>}
        {tagOptions.map((tag) => (
          <label key={tag}>
            <input
              type="checkbox"
              checked={tags.includes(tag)}
              onChange={(event) => setTags(toggle(tags, tag, event.target.checked))}
            />{' '}
            {tag}
          </label>
        ))}
      </fieldset>
      <label>
        其他標籤（以逗號分隔）{' '}
        <input
          type="text"
          value={extraTags}
          onChange={(event) => setExtraTags(event.target.value)}
        />
      </label>
      {errors.tags && <p style={errorStyle}>{errors.tags}</p>}
      <p style={{ margin: 0, color: '#59636e' }}>同時選了類別與標籤時，活動要兩者都符合。</p>

      {errors.form && (
        <p role="alert" style={errorStyle}>
          {errors.form}
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" disabled={submitting}>
          {submitting ? '儲存中…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={submitting}>
            取消
          </button>
        )}
      </div>
    </form>
  );
}
