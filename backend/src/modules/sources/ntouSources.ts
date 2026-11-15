import type { DatabaseSync } from 'node:sqlite';
import type { SourceType } from './sourceTypes.js';

/**
 * 海大官方公告列表；網址須與 ingestion.config.ts 的 scraperConfigs.listUrl 完全一致，
 * 擷取時才對得到擷取設定（測試會檢查兩邊一致）。
 */
export const NTOU_SOURCES: { name: string; url: string; type: SourceType }[] = [
  {
    name: '食品科學系演講公告',
    url: 'https://fs.ntou.edu.tw/p/403-1073-380-1.php?Lang=zh-tw',
    type: 'department_site',
  },
  {
    name: '國際事務處最新消息',
    url: 'https://oia.ntou.edu.tw/p/403-1022-11-1.php?Lang=zh-tw',
    type: 'school_site',
  },
  {
    name: '海大快訊（學校首頁）',
    url: 'https://mprp.ntou.edu.tw/p/403-1017-1031.php?Lang=zh-tw',
    type: 'school_site',
  },
  {
    name: '學務處最新消息',
    url: 'https://stu.ntou.edu.tw/p/403-1023-1023.php?Lang=zh-tw',
    type: 'school_site',
  },
  {
    name: '課外活動指導組最新消息',
    url: 'https://stu.ntou.edu.tw/p/403-1023-1024.php?Lang=zh-tw',
    type: 'school_site',
  },
  {
    name: '總務處最新消息',
    url: 'https://ga.ntou.edu.tw/p/403-1015-1063.php?Lang=zh-tw',
    type: 'school_site',
  },
  {
    name: '研發處最新消息',
    url: 'https://research.ntou.edu.tw/p/403-1021-1027.php?Lang=zh-tw',
    type: 'school_site',
  },
  {
    name: '研發處校外活動資訊',
    url: 'https://research.ntou.edu.tw/p/403-1021-1057.php?Lang=zh-tw',
    type: 'school_site',
  },
  {
    name: '圖書暨資訊處最新消息',
    url: 'https://li.ntou.edu.tw/p/403-1029-11.php?Lang=zh-tw',
    type: 'school_site',
  },
  {
    name: '主計室最新消息',
    url: 'https://acc.ntou.edu.tw/p/403-1088-1034.php?Lang=zh-tw',
    type: 'school_site',
  },
  {
    name: '人事室最新消息',
    url: 'https://personnel.ntou.edu.tw/p/403-1007-11.php?Lang=zh-tw',
    type: 'school_site',
  },
  {
    name: '體育室最新消息',
    url: 'https://peadmin.ntou.edu.tw/p/403-1012-559.php?Lang=zh-tw',
    type: 'school_site',
  },
];

/**
 * 以管理員身分建立海大官方來源，直接設為已核准、啟用中（等同跳過提交與審核）。
 * 已有相同網址的來源就略過，不改動它的審核或啟用狀態，重複執行不會多建。
 */
export function seedNtouSources(
  db: DatabaseSync,
  adminId: number,
): { created: string[]; skipped: string[] } {
  const exists = db.prepare('SELECT 1 FROM sources WHERE url = ?');
  const insert = db.prepare(
    `INSERT INTO sources
      (name, url, type, review_status, enabled, submitted_by, reviewed_by, reviewed_at,
       review_note, ntou_verified)
    VALUES (?, ?, ?, 'approved', 1, ?, ?, datetime('now'), '海大官方公告列表', 1)`,
  );
  const created: string[] = [];
  const skipped: string[] = [];
  for (const source of NTOU_SOURCES) {
    if (exists.get(source.url)) {
      skipped.push(source.name);
    } else {
      insert.run(source.name, source.url, source.type, adminId, adminId);
      created.push(source.name);
    }
  }
  return { created, skipped };
}
