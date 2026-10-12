import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../auth/api';
import {
  SOURCE_TYPE_OPTIONS,
  fetchMySources,
  submitSource,
  type ReviewStatus,
  type Source,
} from './api';

const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '0.25rem' } as const;
const errorStyle = { color: '#cf222e', margin: 0 } as const;
const successStyle = { color: '#1a7f37', margin: 0 } as const;

const TYPE_LABELS = Object.fromEntries(SOURCE_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: '待審核',
  approved: '已核准',
  rejected: '已退回',
};

function statusLabel(source: Source): string {
  if (source.reviewStatus === 'approved' && !source.enabled) return '已核准（已停用）';
  return REVIEW_STATUS_LABELS[source.reviewStatus];
}

export function SubmitSourcePage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    fetchMySources(controller.signal)
      .then(setSources)
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(caught instanceof ApiError ? caught.message : '無法載入你提交的來源');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSources(false);
      });
    return () => controller.abort();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    setError(null);
    setSuccess(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const source = await submitSource({
        name: String(form.get('name') ?? ''),
        url: String(form.get('url') ?? ''),
        type: String(form.get('type') ?? ''),
      });
      setSources((current) => [source, ...current]);
      setSuccess('提交成功！來源目前為「待審核」，管理員核准後才會開始蒐集活動。');
      formElement.reset();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fields);
      } else {
        setError('無法連線到伺服器，請稍後再試');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>提交活動資訊來源</h1>
      <p>
        知道學校、系所或社團有公開的活動公告嗎？提交給我們，管理員審核通過後，系統就會定期蒐集上面的活動。
      </p>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: 480 }}
      >
        <label style={fieldStyle}>
          來源名稱
          <input name="name" maxLength={100} placeholder="例如：資訊工程學系公告" required />
          {fieldErrors.name && <p style={errorStyle}>{fieldErrors.name}</p>}
        </label>

        <label style={fieldStyle}>
          來源網址
          <input
            name="url"
            type="url"
            maxLength={2048}
            placeholder="https://example.edu/news"
            required
          />
          {fieldErrors.url && <p style={errorStyle}>{fieldErrors.url}</p>}
        </label>

        <label style={fieldStyle}>
          來源類型
          <select name="type" defaultValue="" required>
            <option value="" disabled>
              請選擇
            </option>
            {SOURCE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {fieldErrors.type && <p style={errorStyle}>{fieldErrors.type}</p>}
        </label>

        {error && (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        )}
        {success && (
          <p role="status" style={successStyle}>
            {success}
          </p>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? '提交中…' : '提交來源'}
        </button>
      </form>

      <h2>我提交的來源</h2>
      {loadingSources && <p>載入中…</p>}
      {loadError && (
        <p role="alert" style={errorStyle}>
          {loadError}
        </p>
      )}
      {!loadingSources && !loadError && sources.length === 0 && <p>你還沒有提交過來源。</p>}
      {sources.length > 0 && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>名稱</th>
              <th style={{ textAlign: 'left' }}>類型</th>
              <th style={{ textAlign: 'left' }}>提交時間</th>
              <th style={{ textAlign: 'left' }}>狀態</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id}>
                <td>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.name}
                  </a>
                </td>
                <td>{TYPE_LABELS[source.type] ?? source.type}</td>
                <td>{source.createdAt} (UTC)</td>
                <td>{statusLabel(source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
