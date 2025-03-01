import { Client, TextChannel, Collection } from 'discord.js';
import { pool } from '../database/connection';

export class BatchMessageProcessor {
  private static MAX_RETRIES = 3;
  private static RETRY_DELAY = 1000;

  static async processCurrentMonthMessages(client: Client) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    console.log(`${currentYear}年${currentMonth}月のメッセージ履歴を処理しています...`);

    // 今月の開始日を設定
    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const messageCountMap = new Map<string, { count: number; username: string }>();

    try {
      // すべてのサーバーを処理
      for (const guild of client.guilds.cache.values()) {
        console.log(`サーバー「${guild.name}」を処理中...`);

        // テキストチャンネルのみを取得
        const channels = guild.channels.cache.filter(
          channel => channel.type === 0
        ) as Collection<string, TextChannel>;

        // 各チャンネルのメッセージを処理
        for (const channel of channels.values()) {
          console.log(`チャンネル「${channel.name}」を処理中...`);

          try {
            let lastMessageId: string | undefined;
            let processedCount = 0;

            while (true) {
              const messages = await channel.messages.fetch({
                limit: 100,
                before: lastMessageId
              });

              if (messages.size === 0) break;

              // メッセージを処理
              for (const message of messages.values()) {
                const messageDate = message.createdAt;

                // 今月のメッセージのみを処理
                if (messageDate >= startDate && !message.author.bot) {
                  const userId = message.author.id;
                  const current = messageCountMap.get(userId) || {
                    count: 0,
                    username: message.author.username
                  };

                  messageCountMap.set(userId, {
                    count: current.count + 1,
                    username: message.author.username
                  });
                  processedCount++;
                } else if (messageDate < startDate) {
                  // 今月より前のメッセージに到達したら、このチャンネルの処理を終了
                  break;
                }
              }

              console.log(`${channel.name}で${processedCount}件のメッセージを処理しました`);
              lastMessageId = messages.last()?.id;

              // APIレート制限を考慮して少し待機
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (error) {
            console.error(`チャンネル「${channel.name}」の処理中にエラーが発生:`, error);
          }
        }
      }

      // データベースに保存
      const savedCount = await this.saveToDatabase(messageCountMap, currentYear, currentMonth);
      console.log(`今月の履歴データの処理が完了しました。${savedCount}件のデータを保存しました。`);

      // 保存されたデータを確認
      const [rows] = await pool.query(`
        SELECT COUNT(*) as count
        FROM message_counts
        WHERE YEAR(date) = ? AND MONTH(date) = ?
      `, [currentYear, currentMonth]);

      console.log(`データベース内の${currentYear}年${currentMonth}月のレコード数: ${(rows as any[])[0].count}`);

    } catch (error) {
      console.error('バッチ処理中にエラーが発生:', error);
      throw error;
    }
  }

  private static async saveToDatabase(
    messageCountMap: Map<string, { count: number; username: string }>,
    year: number,
    month: number
  ): Promise<number> {
    const date = new Date(year, month - 1, 1).toISOString().split('T')[0];
    let savedCount = 0;

    for (const [userId, data] of messageCountMap.entries()) {
      if (data.count === 0) continue;

      for (let i = 0; i < this.MAX_RETRIES; i++) {
        try {
          const [result] = await pool.query(`
            INSERT INTO message_counts (user_id, username, message_count, date)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            message_count = VALUES(message_count),
            username = VALUES(username)
          `, [userId, data.username, data.count, date]);

          console.log(`ユーザー ${data.username} のデータを保存: ${data.count}件`);
          savedCount++;
          break;
        } catch (error) {
          console.error(`データ保存中にエラーが発生 (試行 ${i + 1}/${this.MAX_RETRIES}):`, error);
          if (i === this.MAX_RETRIES - 1) throw error;
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        }
      }
    }

    return savedCount;
  }
}