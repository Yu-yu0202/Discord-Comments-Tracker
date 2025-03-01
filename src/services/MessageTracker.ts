import { pool } from '../database/connection';

export class MessageTracker {
  private static messageCache: Map<string, { count: number; username: string }> = new Map();
  private static MAX_RETRIES = 3;
  private static RETRY_DELAY = 1000; // 1秒

  private static async executeWithRetry<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    for (let i = 0; i < this.MAX_RETRIES; i++) {
      try {
        return await operation();
      } catch (error: any) {
        if (i === this.MAX_RETRIES - 1) throw error;
        if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
          continue;
        }
        throw error;
      }
    }
    throw new Error('リトライ回数を超過しました');
  }

  static async incrementMessageCount(userId: string, username: string) {
    const current = this.messageCache.get(userId) || { count: 0, username };
    this.messageCache.set(userId, {
      count: current.count + 1,
      username
    });
  }

  static async getUserStatus(userId: string) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const cached = this.messageCache.get(userId);
    const cachedCount = cached ? cached.count : 0;

    return await this.executeWithRetry(async () => {
      const [rows] = await pool.query(`
        SELECT message_count as monthlyCount
        FROM message_counts
        WHERE user_id = ?
        AND YEAR(date) = ?
        AND MONTH(date) = ?
        ORDER BY date DESC
        LIMIT 1
      `, [userId, year, month]);

      return {
        messageCount: ((rows as any[])[0]?.monthlyCount || 0) + cachedCount,
        year: year,
        month: month
      };
    });
  }

  static async saveMessageCounts() {
    const today = new Date().toISOString().split('T')[0];

    for (const [userId, data] of this.messageCache.entries()) {
      if (data.count === 0) continue;

      await this.executeWithRetry(async () => {
        // まず現在の値を取得
        const [existing] = await pool.query(`
          SELECT message_count
          FROM message_counts
          WHERE user_id = ? AND date = ?
        `, [userId, today]);

        if ((existing as any[])[0]) {
          // 既存のレコードがある場合は更新
          await pool.query(`
            UPDATE message_counts
            SET message_count = message_count + ?,
                username = ?
            WHERE user_id = ? AND date = ?
          `, [data.count, data.username, userId, today]);
        } else {
          // 新規レコードの場合は挿入
          await pool.query(`
            INSERT INTO message_counts (user_id, username, message_count, date)
            VALUES (?, ?, ?, ?)
          `, [userId, data.username, data.count, today]);
        }
      });
    }

    this.messageCache.clear();
  }

  static async getMonthlyTopUsers(year: number, month: number) {
    return await this.executeWithRetry(async () => {
      const [rows] = await pool.query(`
        SELECT
          user_id as userId,
          username,
          SUM(message_count) as messageCount
        FROM message_counts
        WHERE YEAR(date) = ? AND MONTH(date) = ?
        GROUP BY user_id, username
        ORDER BY messageCount DESC
        LIMIT 3
      `, [year, month]);

      return rows as Array<{ userId: string; username: string; messageCount: number }>;
    });
  }
}