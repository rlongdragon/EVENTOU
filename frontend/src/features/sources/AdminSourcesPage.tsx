import { useEffect, useState } from 'react';
import { TodoPlaceholder } from '../../shared/TodoPlaceholder';
import { ApiError } from '../auth/api';
import {
  SOURCE_TYPE_OPTIONS,
  fetchAdminSources,
  reviewSource,
  setSourceEnabled,
  type AdminSource,
  type ReviewStatus,
} from './api';

const errorStyle = { color: '#cf222e', margin: 0 } as const;

const TYPE_LABELS = Object.fromEntries(SOURCE_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: '待審核',
  approved: '已核准',
  rejected: '已退回',
};

function ReviewForm({
  source,
  onReviewed,
}: {
  source: AdminSource;
  onReviewed: (source: AdminSource) => void;
}) {
  const [ntouVerified, setNtouVerified] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(decision: 'approved' | 'rejected') {
    setError(null);
    setSubmitting(true);
    try {
      onReviewed(await reviewSource(source.id, { decision, ntouVerified, note }));
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(Object.values(caught.fields)[0] ?? caught.message);
      } else {
        setError('無法連線到伺服器，請稍後再試');
      }
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minWidth: 240 }}>
      <label>
        <input
          type="checkbox"
          checked={ntouVerified}
          onChange={(event) => setNtouVerified(event.target.checked)}
        />{' '}
        已確認此來源為海大單位或社團
      </label>
      <input
        value={note}
        maxLength={500}
        placeholder="審核備註（選填）"
        aria-label={`「${source.name}」的審核備註`}
        onChange={(event) => setNote(event.target.value)}
      />
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="button" disabled={submitting} onClick={() => submit('approved')}>
          核准
        </button>
        <button type="button" disabled={submitting} onClick={() => submit('rejected')}>
          退回
        </button>
      </div>
      {error && (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      )}
    </div>
  );
}

function EnabledToggle({
  source,
  onChanged,
}: {
  source: AdminSource;
  onChanged: (source: AdminSource) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (source.reviewStatus !== 'approved') return <>—</>;

  async function toggle() {
    setError(null);
    setBusy(true);
    try {
      onChanged(await setSourceEnabled(source.id, !source.enabled));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : '無法連線到伺服器，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span>{source.enabled ? '啟用中' : '已停用'}</span>
      <button type="button" disabled={busy} onClick={toggle}>
        {source.enabled ? '停用' : '啟用'}
      </button>
      {error && (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      )}
    </div>
  );
}

export function AdminSourcesPage() {
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('pending');
  const [sources, setSources] = useState<AdminSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAdminSources(filter === 'all' ? undefined : filter, controller.signal)
      .then(setSources)
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(caught instanceof ApiError ? caught.message : '無法載入來源清單');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filter]);

  function changeFilter(next: ReviewStatus | 'all') {
    setFilter(next);
    setLoading(true);
    setLoadError(null);
  }

  function handleReviewed(updated: AdminSource) {
    setSources((current) =>
      filter === 'pending'
        ? current.filter((source) => source.id !== updated.id)
        : current.map((source) => (source.id === updated.id ? updated : source)),
    );
  }

  return (
    <>
      <h1>來源管理</h1>

      <h2>審核與啟用</h2>
      <p>
        核准前請確認來源屬於海大的單位或社團；審核結果會被保存。已核准的來源可在這裡啟用或停用，停用的來源不會被擷取。
      </p>
      <label>
        顯示{' '}
        <select
          value={filter}
          onChange={(event) => changeFilter(event.target.value as typeof filter)}
        >
          <option value="pending">待審核</option>
          <option value="approved">已核准</option>
          <option value="rejected">已退回</option>
          <option value="all">全部</option>
        </select>
      </label>

      {loading && <p>載入中…</p>}
      {loadError && (
        <p role="alert" style={errorStyle}>
          {loadError}
        </p>
      )}
      {!loading && !loadError && sources.length === 0 && <p>沒有符合條件的來源。</p>}
      {sources.length > 0 && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>名稱</th>
              <th style={{ textAlign: 'left' }}>網址</th>
              <th style={{ textAlign: 'left' }}>類型</th>
              <th style={{ textAlign: 'left' }}>提交者</th>
              <th style={{ textAlign: 'left' }}>提交時間</th>
              <th style={{ textAlign: 'left' }}>審核</th>
              <th style={{ textAlign: 'left' }}>啟用狀態</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id} style={{ verticalAlign: 'top' }}>
                <td>{source.name}</td>
                <td>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.url}
                  </a>
                </td>
                <td>{TYPE_LABELS[source.type] ?? source.type}</td>
                <td>{source.submitterName}</td>
                <td>{source.createdAt} (UTC)</td>
                <td>
                  {source.reviewStatus === 'pending' ? (
                    <ReviewForm source={source} onReviewed={handleReviewed} />
                  ) : (
                    <>
                      {REVIEW_STATUS_LABELS[source.reviewStatus]}
                      {source.reviewedAt && <div>{source.reviewedAt} (UTC)</div>}
                      {source.ntouVerified !== null && (
                        <div>
                          {source.ntouVerified ? '已確認為海大單位或社團' : '未確認為海大單位'}
                        </div>
                      )}
                      {source.reviewNote && <div>備註：{source.reviewNote}</div>}
                    </>
                  )}
                </td>
                <td>
                  <EnabledToggle source={source} onChanged={handleReviewed} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* TODO(#23): US-15 來源可信度／風險提示 */}
      <TodoPlaceholder
        title="來源管理（其他功能）"
        issues={[{ number: 23, label: 'US-15 來源可信度／風險提示' }]}
      />
    </>
  );
}
