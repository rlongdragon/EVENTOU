import { useParams } from 'react-router';
import { TodoPlaceholder } from '../../shared/TodoPlaceholder';

export function EventDetailPage() {
  const { eventId } = useParams();

  return (
    <>
      <h1>活動 {eventId}</h1>
      {/* TODO(#12): US-02 活動詳細資訊（呼叫 GET /api/events/:eventId） */}
      <TodoPlaceholder
        title="活動詳細資訊"
        issues={[{ number: 12, label: 'US-02 查看活動詳細資訊' }]}
      />
      {/* TODO(#18): US-03 活動地點地圖 */}
      <TodoPlaceholder
        title="地點地圖"
        issues={[{ number: 18, label: 'US-03 活動頁顯示地點地圖' }]}
      />
      {/* TODO(#15): US-12 分享活動連結 */}
      <TodoPlaceholder title="分享" issues={[{ number: 15, label: 'US-12 分享活動連結' }]} />
      {/* TODO(#14): US-11 評價（需登入，#20） */}
      <TodoPlaceholder title="評價" issues={[{ number: 14, label: 'US-11 對活動評價' }]} />
      {/* TODO(#13): US-10 留言（需登入，#20） */}
      <TodoPlaceholder title="留言" issues={[{ number: 13, label: 'US-10 對活動留言' }]} />
    </>
  );
}
