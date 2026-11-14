import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import coastPhoto from '../../assets/photos/coast.jpg';
import concretePhoto from '../../assets/photos/concrete.jpg';
import harborPhoto from '../../assets/photos/harbor.jpg';
import ridgePhoto from '../../assets/photos/ridge.jpg';
import wavesPhoto from '../../assets/photos/waves.jpg';
import type { EventSearchResult } from './api';
import { searchEvents } from './api';
import { formatEventTime } from './eventTime';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; result: EventSearchResult };

/** 首頁前三筆活動搭配的風景照與圖說（照片來源與授權見頁尾） */
const ISSUE_PHOTOS = [
  { src: coastPhoto, caption: 'The Quiet Coast', place: '和平島 · Keelung' },
  { src: ridgePhoto, caption: 'Less, but Better', place: '合歡山 · Hehuanshan' },
  { src: harborPhoto, caption: 'Into a Wider World', place: '基隆嶼 · Keelung Islet' },
];

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
  const filtered = Boolean(q || category);

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
      <section className="cover">
        <div className="cover-main">
          <span className="cover-kicker">本期 · 校園活動</span>
          <h1 className="cover-title">
            <span className="hero-title-line">
              <span>海大的活動，</span>
            </span>
            <span className="hero-title-line">
              <span className="cover-title-soft">
                一次看完<span className="cover-star">✦</span>
              </span>
            </span>
          </h1>
          <p className="cover-lead fade-in">
            學校首頁與各處室的公告自動整理成同一份清單。可以搜尋、加進行事曆，有新活動就通知你。
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
        </div>
        <figure className="cover-photo fade-in">
          <img src={concretePhoto} alt="清水模牆面與盛開的櫻花枝" />
          <figcaption>
            <span className="label">Light &amp; Order</span>
            <span className="label">EVENTOU</span>
          </figcaption>
        </figure>
      </section>

      <section className="issue" aria-labelledby="issue-heading">
        <div className="issue-head">
          <h2 id="issue-heading">{filtered ? '搜尋結果' : '本期活動'}</h2>
          <span className="label">{filtered ? 'Search Results' : 'This Issue on Campus'}</span>
        </div>
        {state.status === 'loading' && <p>載入中…</p>}
        {state.status === 'error' && <p role="alert">無法載入活動：{state.message}</p>}
        {state.status === 'ok' && (
          <SearchResults result={state.result} withPhotos={!filtered} onPageChange={goToPage} />
        )}
      </section>

      <section className="closing">
        <div className="closing-text">
          <span className="label">Key Takeaway</span>
          <h2>
            活動不再散落各處，
            <br />連<em>免費餐券</em>也不會錯過。
          </h2>
          <span className="label">One list · Every office · Sent to you</span>
        </div>
        <img className="closing-photo" src={wavesPhoto} alt="鼻頭角的礁岩與浪花" />
        <span className="closing-sign">EVENTOU</span>
      </section>
      <p className="photo-credits">
        照片來源 Wikimedia Commons，已裁切並調整色調：和平島海岸 lienyuan lee（CC BY
        3.0）、合歡山雲海 Quintin Lin（CC BY-SA 2.0）、基隆嶼 Taiwankengo（CC BY-SA
        4.0）、清水模牆面 Gryffindor（CC0）、鼻頭角 Liu Dyson（CC BY 3.0）。
      </p>
    </>
  );
}

function SearchResults({
  result,
  withPhotos,
  onPageChange,
}: {
  result: EventSearchResult;
  withPhotos: boolean;
  onPageChange: (page: number) => void;
}) {
  const { items, page, pageSize, total } = result;
  if (total === 0) return <p>找不到符合條件的活動。</p>;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <ol className="issue-list">
        {items.map((item, index) => {
          // 只有第一頁、未篩選時，前三筆搭配照片
          const photo = withPhotos && page === 1 ? ISSUE_PHOTOS[index] : undefined;
          const number = (page - 1) * pageSize + index + 1;
          return (
            <li
              key={item.id}
              className={photo ? 'issue-row has-photo' : 'issue-row'}
              style={{ '--card-index': index } as CSSProperties}
            >
              <Link to={`/events/${item.id}`}>
                <span className="issue-no">{String(number).padStart(2, '0')}</span>
                <span className="issue-text">
                  <span className="issue-category">{item.categoryLabel}</span>
                  <strong className="issue-title">{item.title}</strong>
                  <span className="issue-bar" aria-hidden="true" />
                  <span className="issue-meta">
                    {formatEventTime(item)}
                    <br />
                    {item.location ?? '地點未提供'}
                  </span>
                </span>
                {photo && (
                  <figure className="issue-photo" aria-hidden="true">
                    <img src={photo.src} alt="" />
                    <figcaption>
                      {photo.caption}
                      <small>{photo.place}</small>
                    </figcaption>
                  </figure>
                )}
                <span className="issue-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
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
