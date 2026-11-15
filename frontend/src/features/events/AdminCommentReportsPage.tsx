import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ApiError } from '../auth/api';
import {
  REPORT_REASON_LABELS,
  fetchCommentReports,
  reviewCommentReport,
  type ReportReason,
  type ReportedComment,
} from './api';
import './eventComments.css';

const CONNECTION_ERROR = '無法連線到伺服器，請稍後再試';

const reportTimeFormat = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function errorMessage(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : CONNECTION_ERROR;
}

/** 例：「垃圾訊息或廣告 ×2、其他 ×1」 */
function reasonSummary(reasons: ReportedComment['reasons']): string {
  return (Object.entries(reasons) as [ReportReason, number][])
    .map(([reason, count]) => `${REPORT_REASON_LABELS[reason]} ×${count}`)
    .join('、');
}

/** #65 管理員的留言檢舉審核：隱藏留言或駁回檢舉。 */
export function AdminCommentReportsPage() {
  const [reports, setReports] = useState<ReportedComment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchCommentReports(controller.signal)
      .then(setReports)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(caught));
      });
    return () => controller.abort();
  }, []);

  async function review(commentId: number, action: 'hide' | 'dismiss') {
    setActionError(null);
    setBusyId(commentId);
    try {
      setReports(await reviewCommentReport(commentId, action));
    } catch (caught) {
      setActionError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <h1>留言檢舉</h1>
      <section aria-labelledby="comment-reports-heading">
        <h2 id="comment-reports-heading">待審核{reports ? `（${reports.length}）` : ''}</h2>
        <p>隱藏後留言不再出現在活動頁；駁回則保留留言。同一則留言的所有檢舉會一起結案。</p>
        {actionError && (
          <p role="alert" className="comment-report-error">
            {actionError}
          </p>
        )}
        {loadError && <p role="alert">無法載入檢舉：{loadError}</p>}
        {!reports && !loadError && <p>載入中…</p>}
        {reports && reports.length === 0 && <p>目前沒有待審的檢舉。</p>}
        {reports && reports.length > 0 && (
          <ul className="report-list">
            {reports.map((item) => (
              <li key={item.comment.id} className="report-item">
                <div className="report-meta">
                  <span className="report-count">{item.reportCount} 次檢舉</span>
                  <span>{reasonSummary(item.reasons)}</span>
                  <time dateTime={item.firstReportedAt}>
                    最早 {reportTimeFormat.format(new Date(item.firstReportedAt))}
                  </time>
                </div>
                <blockquote className="report-comment">
                  <p>{item.comment.content}</p>
                  <footer>
                    {item.comment.author.displayName}・
                    <Link to={`/events/${item.event.id}`}>{item.event.title}</Link>
                  </footer>
                </blockquote>
                {item.notes.length > 0 && (
                  <ul className="report-notes" aria-label="檢舉者補充說明">
                    {item.notes.map((note, index) => (
                      <li key={index}>{note}</li>
                    ))}
                  </ul>
                )}
                <div className="report-actions">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void review(item.comment.id, 'hide')}
                  >
                    隱藏留言
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void review(item.comment.id, 'dismiss')}
                  >
                    駁回檢舉
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
