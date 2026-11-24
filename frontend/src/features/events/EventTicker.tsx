import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router';
import type { EventSummary } from './api';
import { searchEvents } from './api';

/** 跑馬燈最多顯示的活動數 */
const TICKER_LIMIT = 10;
/** 每則活動捲過所需秒數（原本 6 秒，速度調為 0.7 × 0.7 倍，約 12.2 秒） */
const SECONDS_PER_ITEM = 6 / (0.7 * 0.7);

/** 開始時間存成 +08:00 的 ISO 字串，直接取出台北日期的「月/日」 */
function shortDate(startTime: string): string {
  return `${startTime.slice(5, 7)}/${startTime.slice(8, 10)}`;
}

function TickerItems({ items, hidden }: { items: EventSummary[]; hidden: boolean }) {
  return (
    // 第二份只用來接續輪播，對輔助科技隱藏，連結也不會被 Tab 選到
    <ul className="ticker-items" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <li key={item.id}>
          <Link to={`/events/${item.id}`} tabIndex={hidden ? -1 : undefined}>
            <span className="ticker-date">{shortDate(item.startTime)}</span>
            <span className="ticker-category">{item.categoryLabel}</span>
            {item.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 首頁跑馬燈：輪播即將開始的活動（沿用搜尋 API 的預設排序：尚未結束、依開始時間） */
export function EventTicker() {
  const [items, setItems] = useState<EventSummary[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    searchEvents(
      { q: '', category: '', topic: '', audience: '', scope: 'all', page: 1 },
      controller.signal,
    )
      .then((data) => setItems(data.items.slice(0, TICKER_LIMIT)))
      .catch(() => {
        // 跑馬燈只是輔助資訊，載入失敗時不顯示即可
      });
    return () => controller.abort();
  }, []);

  if (items.length === 0) return null;

  return (
    <aside className="ticker" aria-label="即將開始的活動">
      <span className="ticker-label">
        Latest <span className="ticker-star">✦</span>{' '}
        <span className="ticker-label-zh">即將開始</span>
      </span>
      <div className="ticker-viewport">
        <div
          className="ticker-track"
          style={{ '--ticker-duration': `${items.length * SECONDS_PER_ITEM}s` } as CSSProperties}
        >
          <TickerItems items={items} hidden={false} />
          <TickerItems items={items} hidden />
        </div>
      </div>
    </aside>
  );
}
