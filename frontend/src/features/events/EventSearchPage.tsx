import { HealthStatus } from '../../shared/HealthStatus';
import { TodoPlaceholder } from '../../shared/TodoPlaceholder';

export function EventSearchPage() {
  return (
    <>
      <h1>活動</h1>
      {/* TODO(#6): US-01 搜尋列與搜尋結果列表（呼叫 GET /api/events） */}
      <TodoPlaceholder title="搜尋活動" issues={[{ number: 6, label: 'US-01 搜尋活動資訊' }]} />
      {/* TODO(#6): 首頁完成後移除，或移到開發用頁面 */}
      <HealthStatus />
    </>
  );
}
