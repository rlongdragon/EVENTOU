import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { EventSearchResult } from './api';
import { searchEvents } from './api';
import { formatEventTime } from './eventTime';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; result: EventSearchResult };

/** 只接受正整數頁碼，其他一律視為第 1 頁 */
function parsePage(value: string | null): number {
  return value && /^[1-9]\d*$/.test(value) ? Number(value) : 1;
}

export function EventSearchPage() {
  // 搜尋條件放在網址，從活動頁返回時保留條件，也方便分享搜尋結果
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const category = searchParams.get('category') ?? '';
  const page = parsePage(searchParams.get('page'));
  const queryKey = `${q}\n${category}\n${page}`;

  // 記錄是哪組條件的結果，條件改變時直接視為載入中
  const [result, setResult] = useState<{ queryKey: string; state: LoadState } | null>(null);
  // 類別選項來自後端，換頁或重新搜尋時沿用上一次的清單，避免下拉選單閃爍
  const [categories, setCategories] = useState<EventSearchResult['categories']>([]);

  useEffect(() => {
    const controller = new AbortController();
    searchEvents({ q, category, page }, controller.signal)
      .then((data) => {
        setCategories(data.categories);
        setResult({ queryKey, state: { status: 'ok', result: data } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ queryKey, state: { status: 'error', message: String(error) } });
      });
    return () => controller.abort();
  }, [q, category, page, queryKey]);

  const state: LoadState = result?.queryKey === queryKey ? result.state : { status: 'loading' };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    const nextQ = String(form.get('q') ?? '').trim();
    const nextCategory = String(form.get('category') ?? '');
    if (nextQ) next.set('q', nextQ);
    if (nextCategory) next.set('category', nextCategory);
    setSearchParams(next);
  }

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage > 1) next.set('page', String(nextPage));
    else next.delete('page');
    setSearchParams(next);
  }

  return (
    <>
      <h1>活動</h1>
      {/* key 讓網址條件改變（例如按上一頁）時表單跟著重設 */}
      <form
        key={`${q}\n${category}`}
        role="search"
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="搜尋標題、說明、地點、主辦單位"
          aria-label="關鍵字"
          style={{ flex: '1 1 16rem' }}
        />
        <select name="category" defaultValue={category} aria-label="類別">
          <option value="">全部類別</option>
          {categories.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="submit">搜尋</button>
      </form>

      {state.status === 'loading' && <p>載入中…</p>}
      {state.status === 'error' && <p role="alert">無法載入活動：{state.message}</p>}
      {state.status === 'ok' && <SearchResults result={state.result} onPageChange={goToPage} />}
    </>
  );
}

function SearchResults({
  result,
  onPageChange,
}: {
  result: EventSearchResult;
  onPageChange: (page: number) => void;
}) {
  const { items, page, pageSize, total } = result;
  if (total === 0) return <p>找不到符合條件的活動。</p>;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {items.map((item) => (
          <li key={item.id} style={{ borderBottom: '1px solid #d0d7de', padding: '0.75rem 0' }}>
            <Link to={`/events/${item.id}`}>
              <strong>{item.title}</strong>
            </Link>
            <div>{formatEventTime(item)}</div>
            <div>
              {item.location ?? '地點未提供'}・{item.categoryLabel}
            </div>
          </li>
        ))}
      </ul>
      <nav aria-label="分頁" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          上一頁
        </button>
        <span>
          第 {page} / {totalPages} 頁，共 {total} 筆
        </span>
        <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          下一頁
        </button>
      </nav>
    </>
  );
}
