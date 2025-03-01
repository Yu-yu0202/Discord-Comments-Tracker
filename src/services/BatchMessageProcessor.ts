import { Client, TextChannel, Collection } from 'discord.js';
import { pool } from '../database/connection';

export class BatchMessageProcessor {
  private static MAX_RETRIES = 3;
  private static RETRY_DELAY = 1000;

  static async processCurrentMonthMessages(client: Client) {
    // UTC日時を取得し、日本時間（UTC+9）に変換
    const now = new Date();
    now.setHours(now.getHours() + 9);

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    console.log(`現在の日本時間: ${now.toISOString()}`);
    console.log(`${currentYear}年${currentMonth}月のメッセージ履歴を処理しています...`);

    // 今月の開始日を日本時間で設定
    const startDate = new Date(currentYear, currentMonth - 1, 1);
    startDate.setHours(startDate.getHours() + 9);

    // 今月の終了日を日本時間で設定
    const endDate = new Date(currentYear, currentMonth, 0);
    endDate.setHours(23, 59, 59, 999);
    endDate.setHours(endDate.getHours() + 9);

    console.log(`処理期間: ${startDate.toISOString()} から ${endDate.toISOString()}`);

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
                // メッセージの日時を日本時間に変換
                const messageDate = new Date(message.createdAt);
                messageDate.setHours(messageDate.getHours() + 9);

                // 今月のメッセージのみを処理
                if (messageDate >= startDate && messageDate <= endDate && !message.author.bot) {
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
                  break;
                }
              }

              console.log(`${channel.name}で${processedCount}件のメッセージを処理しました`);
              lastMessageId = messages.last()?.id;

              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (error) {
            console.error(`チャンネル「${channel.name}」の処理中にエラーが発生:`, error);
          }
        }
      }

      // データベースに保存
      for (const [userId, data] of messageCountMap.entries()) {
        if (data.count === 0) continue;

        try {
          // 日本時間の日付を使用
          const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;

          const [result] = await pool.query(`
            INSERT INTO message_counts (user_id, username, message_count, date)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            message_count = VALUES(message_count),
            username = VALUES(username)
          `, [userId, data.username, data.count, dateStr]);

          console.log(`ユーザー ${data.username} のデータを保存しました:`, {
            userId,
            count: data.count,
            date: dateStr
          });
        } catch (error) {
          console.error('データ保存中のエラー:', error);
          throw error;
        }
      }

      // 最終確認
      const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const [finalCheck] = await pool.query(`
        SELECT COUNT(*) as count, date
        FROM message_counts
        WHERE date = ?
      `, [dateStr]);

      console.log('保存結果の確認:', finalCheck);

    } catch (error) {
      console.error('バッチ処理中にエラーが発生:', error);
      throw error;
    }
  }
}