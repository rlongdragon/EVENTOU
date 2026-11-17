import type { Ref } from 'react';
import './campus3DView.css';

interface Campus3DViewProps {
  title: string;
  /** 模型頁網址；預設為全景，可帶 ?select=<場地 id> 聚焦（見 campus3dVenues.ts） */
  src?: string;
  /** 嵌在活動頁等較小的區塊時用較矮的高度 */
  compact?: boolean;
  iframeRef?: Ref<HTMLIFrameElement>;
}

/**
 * 樣品屋式 3D 校園模型（Three.js）。模型是獨立的 Vite 頁面（campus-3d.html），
 * 以 iframe 嵌入，避免模型的全螢幕版面與事件處理影響外層頁面。
 */
export function Campus3DView({
  title,
  src = '/campus-3d.html',
  compact = false,
  iframeRef,
}: Campus3DViewProps) {
  return (
    <div className={compact ? 'campus-3d-view campus-3d-view--compact' : 'campus-3d-view'}>
      <iframe ref={iframeRef} src={src} title={title} loading="lazy" allow="clipboard-write" />
    </div>
  );
}
