import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { getTaipeiToday } from '../map/dateRange';
import {
  fetchCalendarItems,
  fetchCalendarSources,
  type CalendarItem,
  type CalendarSource,
  type EventCalendarState,
} from './api';
import {
  groupByDay,
  monthGrid,
  monthKey,
  monthTitle,
  shiftMonth,
  yearMonthOf,
  type YearMonth,
} from './calendarMonth';
import { DayAgenda } from './DayAgenda';
import { FollowPanel } from './FollowPanel';
import { MonthCalendar } from './MonthCalendar';
import { CategoryCalendarLinks, MyCalendarSync } from './SyncPanel';
import './calendar.css';

const CATEGORY_OPTIONS = [
  { code: 'lecture', label: '講座' },
  { code: 'workshop', label: '工作坊／研習' },
  { code: 'exhibition', label: '展覽' },
  { code: 'sports', label: '運動' },
  { code: 'welfare', label: '餐飲／福利' },
];

type Scope = 'mine' | 'all';

/** ?month=2026-11；格式不對時回到本月 */
function parseMonth(value: string | null, fallback: YearMonth): YearMonth {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return fallback;
  return yearMonthOf(`${value}-01`);
}

/** 行事曆：站內月曆、追蹤與同步到外部行事曆（#76，整併原本的行事曆與訂閱）。 */
export function CalendarPage() {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [today] = useState(() => getTaipeiToday());
  const month = parseMonth(searchParams.get('month'), yearMonthOf(today));
  const scope: Scope = user && searchParams.get('view') !== 'all' ? 'mine' : 'all';
  const [selectedDay, setSelectedDay] = useState(today);
  const [category, setCategory] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [sources, setSources] = useState<CalendarSource[]>([]);
  // 查詢結果連同查詢條件一起保存：條件改變時先保留上一次的活動，載入完成再換掉，月曆不會閃爍
  const [loaded, setLoaded] = useState<{ key: string; items: CalendarItem[] } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const currentMonthKey = monthKey(month);
  const grid = useMemo(() => monthGrid(yearMonthOf(`${currentMonthKey}-01`)), [currentMonthKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCalendarSources(controller.signal)
      .then(setSources)
      .catch(() => setSources([]));
    return () => controller.abort();
  }, []);

  const includeHidden = scope === 'mine' && showHidden;
  const queryKey = [scope, grid.from, grid.to, category, sourceId, includeHidden, reloadKey].join(
    '|',
  );
  const loading = authLoading || loaded?.key !== queryKey;
  const items = useMemo(() => loaded?.items ?? [], [loaded]);
  const errorMessage = error?.key === queryKey ? error.message : null;

  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    fetchCalendarItems(
      {
        scope,
        from: grid.from,
        to: grid.to,
        category: category || undefined,
        sourceId: sourceId ? Number(sourceId) : undefined,
        includeHidden,
      },
      controller.signal,
    )
      .then((result) => setLoaded({ key: queryKey, items: result }))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError({ key: queryKey, message: String(reason) });
      });
    return () => controller.abort();
  }, [authLoading, scope, grid.from, grid.to, category, sourceId, includeHidden, queryKey]);

  // 從舊的 /subscriptions 導過來時，捲到「追蹤」區塊
  useEffect(() => {
    if (location.hash !== '#follow' || authLoading) return;
    document.getElementById('follow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, authLoading]);

  const itemsByDay = useMemo(() => groupByDay(items, grid.days), [items, grid.days]);

  function updateParams(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  function goToMonth(target: YearMonth) {
    const key = monthKey(target);
    updateParams({ month: key === monthKey(yearMonthOf(today)) ? null : key });
    // 換月時選取該月 1 日；回到本月時選取今天
    setSelectedDay(key === today.slice(0, 7) ? today : `${key}-01`);
  }

  function handleStateChange(eventId: number, state: EventCalendarState) {
    setLoaded(
      (current) =>
        current && {
          ...current,
          items: current.items.map((item) => (item.id === eventId ? { ...item, ...state } : item)),
        },
    );
    // 我的行事曆中移除或隱藏後，重新整理讓月曆與列表一致
    if (scope === 'mine') setReloadKey((key) => key + 1);
  }

  const dayItems = itemsByDay.get(selectedDay) ?? [];

  return (
    <div className="cal-page">
      <h1>行事曆</h1>

      <section className="cal-main" aria-label="月曆">
        <div className="cal-toolbar">
          {user && (
            <div className="cal-scope" role="group" aria-label="顯示範圍">
              <button
                type="button"
                aria-pressed={scope === 'mine'}
                onClick={() => updateParams({ view: null })}
              >
                我的行事曆
              </button>
              <button
                type="button"
                aria-pressed={scope === 'all'}
                onClick={() => updateParams({ view: 'all' })}
              >
                全部活動
              </button>
            </div>
          )}
          <div className="cal-nav">
            <button
              type="button"
              aria-label="上個月"
              onClick={() => goToMonth(shiftMonth(month, -1))}
            >
              ‹
            </button>
            <h2 className="cal-title" aria-live="polite">
              {monthTitle(month)}
            </h2>
            <button
              type="button"
              aria-label="下個月"
              onClick={() => goToMonth(shiftMonth(month, 1))}
            >
              ›
            </button>
            <button type="button" onClick={() => goToMonth(yearMonthOf(today))}>
              今天
            </button>
          </div>
          <div className="cal-filters">
            <label>
              <span className="label">類別</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="">全部類別</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">來源</span>
              <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                <option value="">全部來源</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
            {scope === 'mine' && (
              <label className="cal-checkbox">
                <input
                  type="checkbox"
                  checked={showHidden}
                  onChange={(event) => setShowHidden(event.target.checked)}
                />
                顯示已隱藏的活動
              </label>
            )}
          </div>
        </div>

        {errorMessage && <p role="alert">無法載入行事曆：{errorMessage}</p>}
        {!authLoading && !user && (
          <p className="cal-note">
            正在瀏覽全部活動。<Link to="/login?redirect=%2Fcalendars">登入</Link>
            後可以追蹤類別、領域與來源、把活動加入自己的行事曆，並同步到 Google 日曆等軟體。
          </p>
        )}

        <div className="cal-layout">
          <MonthCalendar
            month={month}
            days={grid.days}
            itemsByDay={itemsByDay}
            today={today}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
          />
          <DayAgenda
            day={selectedDay}
            items={dayItems}
            loading={loading}
            scope={scope}
            signedIn={Boolean(user)}
            onStateChange={handleStateChange}
          />
        </div>
      </section>

      {user && <FollowPanel onChange={() => setReloadKey((key) => key + 1)} />}

      <section aria-labelledby="sync-heading" className="cal-panel">
        <div className="cal-panel-head">
          <h2 id="sync-heading">同步到你的行事曆</h2>
          <p className="cal-muted">
            {user
              ? '訂閱一次，之後新增、隱藏的活動與時間異動都會自動同步（行事曆軟體約每小時更新一次）。'
              : '不用登入也能訂閱各類別的公開行事曆。'}
          </p>
        </div>
        {user ? (
          <>
            <MyCalendarSync />
            <details className="cal-details">
              <summary>也可以訂閱各類別的公開行事曆</summary>
              <CategoryCalendarLinks />
            </details>
          </>
        ) : (
          <CategoryCalendarLinks />
        )}
      </section>
    </div>
  );
}
