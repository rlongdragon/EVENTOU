import { useEffect, useState } from 'react';
import { categoryClassName, categoryGlyph } from '../../shared/eventCategories';
import {
  fetchFollowState,
  setCategoryFollowed,
  setEmailNotifications,
  setSourceFollowed,
  type FollowState,
} from '../subscriptions/api';

const SOURCE_TYPE_LABELS: Record<string, string> = {
  school_site: '學校網站',
  department_site: '系所網站',
  club_site: '社團網站',
  social_media: '社群媒體',
  other: '其他',
};

interface FollowPanelProps {
  /** 追蹤有變動時通知月曆重新載入 */
  onChange: () => void;
}

/** 追蹤類別與來源：追蹤的活動會出現在我的行事曆，有新活動時寄 Email（可關閉）。 */
export function FollowPanel({ onChange }: FollowPanelProps) {
  const [state, setState] = useState<FollowState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchFollowState(controller.signal)
      .then(setState)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(String(reason));
      });
    return () => controller.abort();
  }, []);

  async function update(change: () => Promise<FollowState>, affectsCalendar = true) {
    setBusy(true);
    setError(null);
    try {
      setState(await change());
      if (affectsCalendar) onChange();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  const followedCount =
    (state?.categories.filter((item) => item.subscribed).length ?? 0) +
    (state?.sources.filter((item) => item.followed).length ?? 0);

  return (
    <section id="follow" aria-labelledby="follow-heading" className="cal-panel">
      <div className="cal-panel-head">
        <h2 id="follow-heading">追蹤</h2>
        <p className="cal-muted">
          追蹤的類別與來源有新活動時，會自動出現在你的行事曆
          {state && followedCount === 0 && '。目前還沒有追蹤任何類別或來源'}。
        </p>
      </div>
      {error && <p role="alert">無法更新追蹤：{error}</p>}
      {!state && !error && <p>載入中…</p>}
      {state && (
        <>
          <h3 className="cal-subhead">類別</h3>
          <div className="cal-toggles" role="group" aria-label="追蹤的類別">
            {state.categories.map((item) => (
              <button
                key={item.category}
                type="button"
                className={`cal-toggle ${categoryClassName(item.category)}`}
                aria-pressed={item.subscribed}
                disabled={busy}
                onClick={() =>
                  void update(() => setCategoryFollowed(item.category, !item.subscribed))
                }
              >
                <span className="cal-toggle-glyph" aria-hidden="true">
                  {categoryGlyph(item.category)}
                </span>
                {item.label}
              </button>
            ))}
          </div>

          <h3 className="cal-subhead">來源</h3>
          {state.sources.length === 0 ? (
            <p className="cal-muted">目前沒有可追蹤的來源。</p>
          ) : (
            <ul className="cal-sources">
              {state.sources.map((source) => (
                <li key={source.id}>
                  <span>
                    {source.name}
                    <span className="cal-muted">
                      {' '}
                      · {SOURCE_TYPE_LABELS[source.type] ?? '其他'}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="cal-follow-button"
                    aria-pressed={source.followed}
                    aria-label={`${source.followed ? '取消追蹤' : '追蹤'}${source.name}`}
                    disabled={busy}
                    onClick={() =>
                      void update(() => setSourceFollowed(source.id, !source.followed))
                    }
                  >
                    {source.followed ? '追蹤中' : '追蹤'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="cal-switch">
            <input
              type="checkbox"
              checked={state.emailNotifications}
              disabled={busy}
              onChange={(event) =>
                void update(() => setEmailNotifications(event.target.checked), false)
              }
            />
            <span>
              追蹤的類別或來源有新活動時寄 Email 給我
              <span className="cal-muted cal-switch-note">
                每個活動只會通知一次；關閉後仍會出現在行事曆
              </span>
            </span>
          </label>
        </>
      )}
    </section>
  );
}
