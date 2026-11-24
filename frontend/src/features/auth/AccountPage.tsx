import { useState, type FormEvent } from 'react';
import { ApiError } from './api';
import { useAuth } from './AuthContext';

const fieldStyle = { display: 'flex', flexDirection: 'column', gap: '0.25rem' } as const;
const errorStyle = { color: '#cf222e', margin: 0 } as const;
const successStyle = { color: '#1a7f37', margin: 0 } as const;

/** #90 會員資料：顯示名稱（留言等公開位置使用）與新活動通知信箱 */
export function AccountPage() {
  const { user, updateProfile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!user) return null;

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
      });
      setSaved(true);
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
    <section style={{ maxWidth: 420 }}>
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
