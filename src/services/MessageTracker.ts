import { pool } from '../database/connection';

interface MessageCount {
  userId: string;
  username: string;
  messageCount: number;
}

export class MessageTracker {
  private static messageCache: Map<string, { count: number; username: string }> = new Map();

  static async incrementMessageCount(userId: string, username: string) {
    const current = this.messageCache.get(userId) || { count: 0, username };
    this.messageCache.set(userId, {
      count: current.count + 1,
      username
    });
  }

  static async saveMessageCounts() {
    const today = new Date().toISOString().split('T')[0];

    for (const [userId, data] of this.messageCache.entries()) {
      try {
        await pool.query(`
          INSERT INTO message_counts (user_id, username, message_count, date)
          VALUES (?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE message_count = message_count + ?, username = ?
        `, [userId, data.username, data.count, today, data.count, data.username]);
      } catch (error) {
        console.error(`ユーザー ${userId} のメッセージ数の保存中にエラーが発生しました:`, error);
      }
    }

    this.messageCache.clear();
  }

  static async getTopUsers(date: string): Promise<Array<{ userId: string; username: string; messageCount: number }>> {
    const [rows] = await pool.query(`
      SELECT user_id as userId, username, message_count as messageCount
      FROM message_counts
      WHERE date = ?
      ORDER BY message_count DESC
      LIMIT 3
    `, [date]);

    return rows as Array<{ userId: string; username: string; messageCount: number }>;
  }

  static async getUserStatus(userId: string) {
    const [rows] = await pool.query(`
      SELECT message_count as messageCount, date
      FROM message_counts
      WHERE user_id = ?
      ORDER BY date DESC
      LIMIT 1
    `, [userId]);

    return (rows as any[])[0];
  }
}