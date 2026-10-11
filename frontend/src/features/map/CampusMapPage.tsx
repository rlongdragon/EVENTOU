import { TodoPlaceholder } from '../../shared/TodoPlaceholder';

export function CampusMapPage() {
  return (
    <>
      <h1>校園活動地圖</h1>
      {/* TODO(#19): US-04 整合式校園活動地圖（呼叫 GET /api/map/events） */}
      <TodoPlaceholder
        title="校園活動地圖"
        issues={[{ number: 19, label: 'US-04 整合式校園活動地圖' }]}
      />
    </>
  );
}
