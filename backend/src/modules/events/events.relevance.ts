import type { Department, EventAudience, EventCategory, EventTopic } from './events.types.js';

// #88／#98 相關度計分：先用規則加權，之後再換推薦演算法。分數達 RELEVANT_SCORE 才算「跟我相關」。

export interface RelevanceProfile {
  department: Department | null;
  /** 年級 1–4，4 代表 4 年級以上；推不出時為 null */
  grade: number | null;
  /** 使用者確認過的偏好領域（#98） */
  interests: EventTopic[];
}

export interface RelevanceTarget {
  category: EventCategory;
  topics: EventTopic[];
  audiences: EventAudience[];
  audienceDepartments: Department[];
  audienceGrades: number[];
}

export const RELEVANT_SCORE = 2;

/** 系所相關的領域與加分；資工系 → 資訊、資安、AI。 */
const DEPARTMENT_TOPICS: Record<Department, Partial<Record<EventTopic, number>>> = {
  csie: { it: 2, security: 2, ai: 2, electrical: 1, startup: 1 },
};

/** 只開放給教職員或校外人士、不含學生的活動，不推薦給學生。 */
const NON_STUDENT_AUDIENCES: EventAudience[] = ['staff', 'public'];

export function relevanceScore(profile: RelevanceProfile, event: RelevanceTarget): number {
  let score = 0;
  if (profile.department) {
    if (event.audienceDepartments.includes(profile.department)) score += 3;
    const weights = DEPARTMENT_TOPICS[profile.department];
    score += Math.max(0, ...event.topics.map((topic) => weights[topic] ?? 0));
  }
  // 偏好領域：每符合一個 +2，最多 +4
  const matched = event.topics.filter((topic) => profile.interests.includes(topic)).length;
  score += Math.min(4, matched * 2);
  if (
    event.audiences.length &&
    event.audiences.every((audience) => NON_STUDENT_AUDIENCES.includes(audience))
  )
    score -= 3;
  if (profile.grade !== null) {
    if (event.audienceGrades.length) score += event.audienceGrades.includes(profile.grade) ? 1 : -2;
    // 只給研究生的活動，大學部扣分
    if (event.audiences.length === 1 && event.audiences[0] === 'graduate') score -= 1;
    // 低年級偏活動、社團；高年級偏實習、就業、升學
    if (profile.grade <= 2 && event.category === 'camp') score += 1;
    if (
      profile.grade >= 3 &&
      event.topics.some((topic) => topic === 'career' || topic === 'graduate')
    )
      score += 1;
  }
  return score;
}

/** 民國學年度：8 月 1 日起算新學年。 */
export function currentAcademicYear(now = new Date()): number {
  const taipei = new Date(now.getTime() + 8 * 3600000);
  const rocYear = taipei.getUTCFullYear() - 1911;
  return taipei.getUTCMonth() >= 7 ? rocYear : rocYear - 1;
}

/** 由入學學年推算年級，超過 4 年算 4（4 年級以上）；入學學年在未來時回傳 null。 */
export function gradeFromAdmissionYear(
  admissionYear: number | null,
  now = new Date(),
): number | null {
  if (admissionYear === null) return null;
  const grade = currentAcademicYear(now) - admissionYear + 1;
  if (grade < 1) return null;
  return Math.min(grade, 4);
}

/**
 * 從學號推系所與入學學年（#88）。海大沒有公開編碼規則，目前只確定資工系學士班：
 * 8 碼，第 1 碼 0（學士班）、第 2–3 碼入學學年末兩碼、第 4–5 碼 57（資工）。
 * 其他學號推不出來，維持非個人化。
 */
export function profileFromStudentId(
  studentId: string | null,
): { department: Department; admissionYear: number } | null {
  const match = studentId?.match(/^0(\d{2})57\d{3}$/);
  if (!match) return null;
  return { department: 'csie', admissionYear: 100 + Number(match[1]) };
}
