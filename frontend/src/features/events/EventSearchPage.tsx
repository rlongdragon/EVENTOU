import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import concretePhoto from '../../assets/photos/concrete.jpg';
import wavesPhoto from '../../assets/photos/waves.jpg';
import type { EventScope, EventSearchResult } from './api';
import { searchEvents } from './api';
import { DEFAULT_PHOTOS, PHOTO_CREDITS } from './defaultPhotos';
import { pickEventImages } from './eventImage';
import { EventTicker } from './EventTicker';
import { formatEventTime } from './eventTime';
import { WordmarkIntro, type IntroPhase } from './WordmarkIntro';

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
  const topic = searchParams.get('topic') ?? '';
  // #88 預設是「跟我相關」（後端判斷這位使用者能不能個人化），scope=all 切回全部
  const scope: EventScope = searchParams.get('scope') === 'all' ? 'all' : 'mine';
  const page = parsePage(searchParams.get('page'));
  const queryKey = `${q}\n${category}\n${topic}\n${scope}\n${page}`;
  const filtered = Boolean(q || category || topic);

  // 記錄是哪組條件的結果，條件改變時直接視為載入中
  const [result, setResult] = useState<{ queryKey: string; state: LoadState } | null>(null);
  // 篩選選項與個人化狀態來自後端，換頁或重新搜尋時沿用上一次的值，避免選單與切換鈕閃爍
  const [categories, setCategories] = useState<EventSearchResult['categories']>([]);
  const [topics, setTopics] = useState<EventSearchResult['topics']>([]);
  const [personal, setPersonal] = useState<EventSearchResult['personal']>({
    available: false,
    active: false,
  });
  const [introPhase, setIntroPhase] = useState<IntroPhase>('done');

  useEffect(() => {
    const controller = new AbortController();
    searchEvents({ q, category, topic, scope, page }, controller.signal)
      .then((data) => {
        setCategories(data.categories);
        setTopics(data.topics);
        setPersonal(data.personal);
        setResult({ queryKey, state: { status: 'ok', result: data } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ queryKey, state: { status: 'error', message: String(error) } });
      });
    return () => controller.abort();
  }, [q, category, topic, scope, page, queryKey]);

  const state: LoadState = result?.queryKey === queryKey ? result.state : { status: 'loading' };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    const nextQ = String(form.get('q') ?? '').trim();
    const nextCategory = String(form.get('category') ?? '');
    const nextTopic = String(form.get('topic') ?? '');
    if (nextQ) next.set('q', nextQ);
    if (nextCategory) next.set('category', nextCategory);
    if (nextTopic) next.set('topic', nextTopic);
    if (scope === 'all') next.set('scope', 'all');
    setSearchParams(next);
  }

  function changeScope(nextScope: EventScope) {
    const next = new URLSearchParams(searchParams);
    next.delete('page');
    if (nextScope === 'all') next.set('scope', 'all');
    else next.delete('scope');
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
      <EventTicker />
      <section className="cover" data-intro={introPhase === 'done' ? undefined : introPhase}>
        <div className="cover-main">
          <span className="cover-kicker">EVENT ∩ NTOU / EVENT TO U</span>
          <h1 className="cover-title">
            <span className="hero-title-line">
              <WordmarkIntro onPhase={setIntroPhase} />
            </span>
            <span className="hero-title-line">
              <span className="cover-title-soft">
                活動與海大，在這裡交會<span className="cover-star">✦</span>
              </span>
            </span>
          </h1>
          <p className="cover-lead fade-in">
            為你彙整海大的活動；學校首頁與各處室的公告自動整理成同一份清單。可以搜尋、加進行事曆，有新活動就通知你。
          </p>
          {/* key 讓網址條件改變（例如按上一頁）時表單跟著重設 */}
          <form
            key={`${q}\n${category}\n${topic}`}
            role="search"
            onSubmit={handleSubmit}
            className="search-bar fade-in"
          >
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="搜尋標題、摘要、地點、主辦單位"
              aria-label="關鍵字"
            />
            <select name="category" defaultValue={category} aria-label="形式">
              <option value="">全部形式</option>
              {categories.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
            <select name="topic" defaultValue={topic} aria-label="主題">
              <option value="">全部主題</option>
              {topics.map((option) => (
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
          <h2 id="issue-heading">
            {filtered ? '搜尋結果' : personal.active ? '跟我相關' : '本期活動'}
          </h2>
          {personal.available ? (
            <div className="scope-toggle" role="group" aria-label="活動範圍">
              <button
                type="button"
                aria-pressed={scope === 'mine'}
                onClick={() => changeScope('mine')}
              >
                跟我相關
              </button>
              <button
                type="button"
                aria-pressed={scope === 'all'}
                onClick={() => changeScope('all')}
              >
                全部
              </button>
            </div>
          ) : (
            <span className="label">{filtered ? 'Search Results' : 'This Issue on Campus'}</span>
          )}
        </div>
        {state.status === 'loading' && <p>載入中…</p>}
        {state.status === 'error' && <p role="alert">無法載入活動：{state.message}</p>}
        {state.status === 'ok' && <SearchResults result={state.result} onPageChange={goToPage} />}
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
      <p className="photo-credits">{PHOTO_CREDITS}</p>
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
  // 每一列都配圖：活動有自己的圖就用原圖，沒有就用預設圖（相鄰兩列不重複）
  const images = pickEventImages(items, DEFAULT_PHOTOS);

  return (
    <>
      <ol className="issue-list">
        {items.map((item, index) => {
          const photo = images[index];
          const number = (page - 1) * pageSize + index + 1;
          return (
            <li
              key={item.id}
              className="issue-row has-photo"
              style={{ '--card-index': index } as CSSProperties}
            >
              <Link to={`/events/${item.id}`}>
                <span className="issue-no">{String(number).padStart(2, '0')}</span>
                <span className="issue-text">
                  <span className="issue-category">
                    {[item.categoryLabel, ...item.topics.map((topic) => topic.label)].join(' · ')}
                  </span>
                  <strong className="issue-title">{item.title}</strong>
                  {item.summary && <span className="issue-summary">{item.summary}</span>}
                  <span className="issue-bar" aria-hidden="true" />
                  <span className="issue-meta">
                    {formatEventTime(item)}
                    <br />
                    {item.location ?? '地點未提供'}
                  </span>
                </span>
                <figure className="issue-photo" aria-hidden="true">
                  <img src={photo.src} alt="" loading="lazy" />
                  {photo.place && (
                    <figcaption>
                      <small>{photo.place}</small>
                    </figcaption>
                  )}
                </figure>
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
