import { useEffect, useState } from 'react';
import { fetchCategoryCalendars, fetchFeedPath, resetFeedPath, type CategoryCalendar } from './api';
import {
  absoluteUrl,
  googleSubscribeUrl,
  isPrivateOrigin,
  outlookSubscribeUrl,
  webcalUrl,
} from './calendarLinks';

const FEED_NAME = 'EVENTOU 我的行事曆';

type CopyState = 'idle' | 'copied' | 'failed';

/** 網站只在本機或區域網路執行時，說明為什麼線上行事曆服務無法自動同步。 */
function PrivateOriginNote({ host }: { host: string }) {
  return (
    <div className="cal-note" role="note">
      <strong>目前網站在 {host} 上執行</strong>
      <p>
        Google 日曆、Outlook.com 這類線上服務是從它們的伺服器連到同步網址，連不到你電腦上的網站，
        所以現在無法自動同步。網站部署到公開網址後，按下面的按鈕就能一鍵訂閱。
      </p>
      <p>
        現在可以：用同一台電腦上的行事曆軟體訂閱，或下載 .ics
        匯入（匯入的是當下的快照，之後不會自動更新）。
      </p>
    </div>
  );
}

/** 把「我的行事曆」同步到 Google 日曆、Apple 行事曆、Outlook。 */
export function MyCalendarSync() {
  const [feedPath, setFeedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [resetting, setResetting] = useState(false);
  const origin = window.location.origin;
  const privateOrigin = isPrivateOrigin(origin);

  useEffect(() => {
    const controller = new AbortController();
    fetchFeedPath(controller.signal)
      .then(setFeedPath)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(String(reason));
      });
    return () => controller.abort();
  }, []);

  if (error) return <p role="alert">無法取得同步網址：{error}</p>;
  if (!feedPath) return <p>載入中…</p>;
  const feedUrl = absoluteUrl(feedPath, origin);

  async function handleCopy() {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(feedUrl);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }

  async function handleReset() {
    const confirmed = window.confirm(
      '重設後，舊的同步網址會立即失效，已經訂閱的行事曆軟體需要用新網址重新訂閱。確定要重設嗎？',
    );
    if (!confirmed) return;
    setResetting(true);
    try {
      setFeedPath(await resetFeedPath());
      setCopyState('idle');
    } catch (reason: unknown) {
      setError(String(reason));
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      {privateOrigin && <PrivateOriginNote host={new URL(origin).host} />}
      <div className="cal-sync-buttons">
        {privateOrigin ? (
          <>
            <button type="button" disabled title="網站部署到公開網址後才能使用">
              Google 日曆
            </button>
            <button type="button" disabled title="網站部署到公開網址後才能使用">
              Outlook.com
            </button>
          </>
        ) : (
          <>
            <a
              className="cal-sync-button"
              href={googleSubscribeUrl(feedUrl)}
              target="_blank"
              rel="noreferrer"
            >
              Google 日曆
            </a>
            <a
              className="cal-sync-button"
              href={outlookSubscribeUrl(feedUrl, FEED_NAME)}
              target="_blank"
              rel="noreferrer"
            >
              Outlook.com
            </a>
          </>
        )}
        <a className="cal-sync-button" href={webcalUrl(feedUrl)}>
          {privateOrigin ? '用這台電腦的行事曆軟體訂閱' : 'Apple 行事曆／Outlook 桌面版'}
        </a>
        <a className="cal-sync-button" href={feedPath} download="eventou-my-calendar.ics">
          下載 .ics
        </a>
      </div>
      <details className="cal-details">
        <summary>手動訂閱：複製同步網址</summary>
        <p className="cal-muted">
          在行事曆軟體選「從網址新增行事曆／訂閱行事曆」，貼上這個網址。拿到網址的人都能看到你的行事曆，請不要公開分享；
          不小心外流時可以重設。
        </p>
        <div className="cal-copy">
          <input
            type="text"
            readOnly
            value={feedUrl}
            aria-label="我的行事曆同步網址"
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" onClick={() => void handleCopy()}>
            複製
          </button>
          <button type="button" onClick={() => void handleReset()} disabled={resetting}>
            重設網址
          </button>
        </div>
        <p role="status" className="cal-muted">
          {copyState === 'copied' && '已複製同步網址'}
          {copyState === 'failed' && '無法自動複製，請手動選取網址'}
        </p>
      </details>
    </>
  );
}

/** 訪客也能訂閱的各類別公開行事曆（US-05）。 */
export function CategoryCalendarLinks() {
  const [calendars, setCalendars] = useState<CategoryCalendar[] | null>(null);
  const origin = window.location.origin;
  const privateOrigin = isPrivateOrigin(origin);

  useEffect(() => {
    const controller = new AbortController();
    fetchCategoryCalendars(controller.signal)
      .then(setCalendars)
      .catch(() => setCalendars([]));
    return () => controller.abort();
  }, []);

  if (!calendars) return null;
  return (
    <ul className="cal-category-feeds">
      {calendars.map((calendar) => {
        const url = absoluteUrl(calendar.icsPath, origin);
        return (
          <li key={calendar.category}>
            <span>{calendar.label}</span>
            {!privateOrigin && (
              <a href={googleSubscribeUrl(url)} target="_blank" rel="noreferrer">
                Google 日曆
              </a>
            )}
            <a href={webcalUrl(url)}>{privateOrigin ? '行事曆軟體' : 'Apple／Outlook'}</a>
            <a href={calendar.icsPath} download={`eventou-${calendar.category}.ics`}>
              .ics
            </a>
          </li>
        );
      })}
    </ul>
  );
}
