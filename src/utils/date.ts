// 回傳 CST（UTC+8）今天的日期字串，格式 YYYY-MM-DD
export function todayCSTDate(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
