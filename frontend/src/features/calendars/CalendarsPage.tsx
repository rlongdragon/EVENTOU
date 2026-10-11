import { TodoPlaceholder } from '../../shared/TodoPlaceholder';

export function CalendarsPage() {
  return (
    <>
      <h1>行事曆</h1>
      {/* TODO(#8): US-05 類別公開行事曆，顯示 iCal 訂閱網址 */}
      {/* TODO(#11): US-09 個人行事曆（需登入，#20） */}
      <TodoPlaceholder
        title="行事曆"
        issues={[
          { number: 8, label: 'US-05 訂閱類別公開行事曆（iCal）' },
          { number: 11, label: 'US-09 依類別與標籤建立個人行事曆' },
        ]}
      />
    </>
  );
}
