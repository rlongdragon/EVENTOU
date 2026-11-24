import { useEffect, useState, type FormEvent } from 'react';
import { fetchTaxonomy, type CodeLabel } from '../events/api';
import { ApiError, suggestInterests } from './api';
import { useAuth } from './AuthContext';

const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '0.25rem' } as const;
const errorStyle = { color: '#cf222e', margin: 0 } as const;
const successStyle = { color: '#1a7f37', margin: 0 } as const;
const DESCRIPTION_MAX_LENGTH = 200;

/** #90 會員資料、#88 個人化推薦、#98 自我描述與偏好領域 */
export function AccountPage() {
  const { user, updateProfile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topics, setTopics] = useState<CodeLabel[]>([]);
  const [description, setDescription] = useState(user?.interestDescription ?? '');
  const [interests, setInterests] = useState<string[]>(user?.interestTopics ?? []);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchTaxonomy(controller.signal)
      .then((taxonomy) => setTopics(taxonomy.topics))
      .catch(() => {
        // 載入失敗時不顯示領域勾選，其餘設定照常可用
      });
    return () => controller.abort();
  }, []);

  if (!user) return null;

  function toggleInterest(code: string) {
    setSaved(false);
    setInterests((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }

  async function handleSuggest() {
    setSuggesting(true);
    setSuggestNote(null);
    try {
      const suggested = await suggestInterests(description.trim());
      if (suggested === null) setSuggestNote('目前無法使用 AI 建議');
      else {
        setInterests(suggested);
        setSaved(false);
        setSuggestNote(suggested.length ? '已勾選建議的領域，確認後儲存' : '沒有找到合適的領域');
      }
    } catch {
      setSuggestNote('目前無法使用 AI 建議');
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSaved(false);
    setFieldErrors({});
    setSubmitting(true);
    try {
      const admissionYear = String(form.get('admissionYear') ?? '').trim();
      await updateProfile({
        displayName: String(form.get('displayName') ?? ''),
        email: String(form.get('email') ?? ''),
        personalize: form.get('personalize') === 'on',
        department: String(form.get('department') ?? '') || null,
        admissionYear: admissionYear ? Number(admissionYear) : null,
        interestDescription: description.trim(),
        interestTopics: interests,
      });
      setSaved(true);
      setSuggestNote(null);
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
    <section style={{ maxWidth: 520 }}>
      <h1>帳號</h1>
      {user.studentId && <p>學號 {user.studentId}</p>}
      <form
        onSubmit={handleSubmit}
        onChange={() => setSaved(false)}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
      >
        <label style={fieldStyle}>
          顯示名稱
          <input
            name="displayName"
            defaultValue={user.displayName}
            autoComplete="nickname"
            maxLength={50}
            required
          />
          {fieldErrors.displayName && <p style={errorStyle}>{fieldErrors.displayName}</p>}
        </label>
        <label style={fieldStyle}>
          通知信箱
          <input
            name="email"
            type="email"
            defaultValue={user.email ?? ''}
            autoComplete="email"
            maxLength={254}
          />
          {fieldErrors.email && <p style={errorStyle}>{fieldErrors.email}</p>}
        </label>
        <fieldset style={{ ...fieldStyle, gap: '0.75rem', border: 0, padding: 0, margin: 0 }}>
          <legend style={{ marginBottom: '0.5rem' }}>個人化推薦</legend>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input type="checkbox" name="personalize" defaultChecked={user.personalize} />
            首頁預設顯示跟我相關的活動
          </label>
          <label style={fieldStyle}>
            系所
            <select name="department" defaultValue={user.department ?? ''}>
              <option value="">未設定</option>
              <option value="csie">資訊工程學系</option>
            </select>
            {fieldErrors.department && <p style={errorStyle}>{fieldErrors.department}</p>}
          </label>
          <label style={fieldStyle}>
            入學學年
            <input
              name="admissionYear"
              type="number"
              inputMode="numeric"
              min={90}
              defaultValue={user.admissionYear ?? ''}
              placeholder="例如 113"
            />
            {user.grade !== null && (
              <small>{user.grade >= 4 ? '4 年級以上' : `${user.grade} 年級`}</small>
            )}
            {fieldErrors.admissionYear && <p style={errorStyle}>{fieldErrors.admissionYear}</p>}
          </label>
          <small>系所與入學學年由學號推算，可自行修正。</small>
          <label style={fieldStyle}>
            關於我
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={DESCRIPTION_MAX_LENGTH}
              rows={3}
              placeholder="資工大三，想找暑期實習，對資安和創業有興趣"
            />
            {fieldErrors.interestDescription && (
              <p style={errorStyle}>{fieldErrors.interestDescription}</p>
            )}
          </label>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleSuggest}
              disabled={suggesting || !description.trim()}
            >
              {suggesting ? '分析中…' : 'AI 建議領域'}
            </button>
            {suggestNote && <small role="status">{suggestNote}</small>}
          </div>
          {topics.length > 0 && (
            <div className="interest-chips" role="group" aria-label="感興趣的領域">
              {topics.map((topic) => (
                <label key={topic.code} data-checked={interests.includes(topic.code)}>
                  <input
                    type="checkbox"
                    checked={interests.includes(topic.code)}
                    onChange={() => toggleInterest(topic.code)}
                  />
                  {topic.label}
                </label>
              ))}
            </div>
          )}
          {fieldErrors.interestTopics && <p style={errorStyle}>{fieldErrors.interestTopics}</p>}
        </fieldset>
        {error && (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        )}
        {saved && (
          <p role="status" style={successStyle}>
            已儲存
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? '儲存中…' : '儲存'}
        </button>
      </form>
    </section>
  );
}
