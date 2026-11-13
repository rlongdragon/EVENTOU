import { useEffect, useState, type CSSProperties, type FormEvent, type MouseEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { EventSearchResult } from './api';
import { searchEvents } from './api';
import { formatEventTime } from './eventTime';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; result: EventSearchResult };

/** 把游標在卡片內的位置寫進 CSS 變數，讓聚光效果跟著游標移動 */
function moveSpotlight(event: MouseEvent<HTMLAnchorElement>) {
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  card.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
  card.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
}

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
      <section className="hero">
        <div className="hero-blobs" aria-hidden="true">
          <span className="hero-blob" />
          <span className="hero-blob" />
          <span className="hero-blob" />
        </div>
        <h1 className="hero-title">
          <span className="hero-title-line">
            <span>把散落各處的</span>
          </span>
          <span className="hero-title-line">
            <span>校園活動</span>
          </span>
          <span className="hero-title-line">
            <span>收進同一片海。</span>
          </span>
        </h1>
        <p className="hero-lead fade-in">
          各來源的活動公告自動整理成同一份清單，可以搜尋、加進行事曆，有新活動就通知你。
        </p>
        {/* key 讓網址條件改變（例如按上一頁）時表單跟著重設 */}
        <form
          key={`${q}\n${category}`}
          role="search"
          onSubmit={handleSubmit}
          className="search-bar fade-in"
        >
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="搜尋標題、說明、地點、主辦單位"
            aria-label="關鍵字"
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
      </section>

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
      <ul className="event-grid">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="event-card"
            style={{ '--card-index': index } as CSSProperties}
          >
            <Link to={`/events/${item.id}`} onMouseMove={moveSpotlight}>
              <span className="event-card-category">{item.categoryLabel}</span>
              <strong className="event-card-title">{item.title}</strong>
              <span className="event-card-meta">{formatEventTime(item)}</span>
              <span className="event-card-meta">{item.location ?? '地點未提供'}</span>
            </Link>
          </li>
        ))}
      </ul>
      <nav aria-label="分頁" className="pagination">
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
