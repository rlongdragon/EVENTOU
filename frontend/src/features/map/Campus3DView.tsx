import type { Ref } from 'react';
import './campus3DView.css';

interface Campus3DViewProps {
  title: string;
  iframeRef?: Ref<HTMLIFrameElement>;
}

/**
 * 樣品屋式 3D 校園模型（Three.js）。模型是獨立的 Vite 頁面（campus-3d.html），
 * 以 iframe 嵌入，避免模型的全螢幕版面與事件處理影響外層頁面。
 */
export function Campus3DView({ title, iframeRef }: Campus3DViewProps) {
  return (
    <div className="campus-3d-view">
      <iframe
        ref={iframeRef}
        src="/campus-3d.html"
        title={title}
        loading="lazy"
        allow="clipboard-write"
      />
    </div>
  );
}
