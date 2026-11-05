import { useEffect, useRef, useState } from 'react';
import { eventShareUrl } from './eventShare';

/** 「已複製」提示顯示的時間 */
const COPIED_MESSAGE_MS = 2000;

type CopyState = 'idle' | 'copied' | 'failed';

/** US-12 分享活動連結：複製活動頁的固定網址並提示「已複製」。 */
export function ShareEventButton({ eventId }: { eventId: number }) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const timer = useRef<number | undefined>(undefined);
  const url = eventShareUrl(window.location.origin, eventId);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function handleShare() {
    window.clearTimeout(timer.current);
    try {
      // 剪貼簿 API 只在 HTTPS 或 localhost 可用，不可用時改顯示網址讓使用者手動複製
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
      timer.current = window.setTimeout(() => setCopyState('idle'), COPIED_MESSAGE_MS);
    } catch {
      setCopyState('failed');
    }
  }

  return (
    <section aria-labelledby="event-share-heading">
      <h2 id="event-share-heading">分享</h2>
      <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void handleShare()}>
          分享
        </button>
        <span role="status">{copyState === 'copied' ? '已複製' : ''}</span>
      </p>
      {copyState === 'failed' && (
        <p>
          <label>
            無法自動複製，請手動複製活動連結：
            <input
              type="text"
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              style={{ width: '100%' }}
              autoFocus
            />
          </label>
        </p>
      )}
    </section>
  );
}
