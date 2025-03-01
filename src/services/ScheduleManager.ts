import { Client } from 'discord.js';
import cron from 'node-cron';
import { MessageTracker } from './MessageTracker';
import { pool } from '../database/connection';
import dotenv from 'dotenv';

dotenv.config();

const Role = [
  process.env.FIRST_PLACE_ROLE_ID,process.env.SECOND_PLACE_ROLE_ID,process.env.THIRD_PLACE_ROLE_ID
]

interface RankingResult {
  user_id: string;
  username: string;
  message_count: number;
}
type RankingResults = RankingResult[];
export class ScheduleManager {
  private static client: Client;
  private static lastProcessedDaily: Date | null = null;
  private static lastProcessedMonthly: Date | null = null;

  static initialize(discordClient: Client) {
    this.client = discordClient;
    this.loadLastProcessedDates().then(() => {
      this.checkMissedTasks().then(() => {
        this.setupSchedules();
      });
    }).catch(error => {
      console.error('初期化中にエラーが発生:', error);
    });
  }

  private static async loadLastProcessedDates() {
    try {
      // last_processed テーブルから最終実行日時を読み込む
      const [rows] = await pool.query(`
        SELECT process_type, last_processed_at
        FROM last_processed
        WHERE process_type IN ('daily', 'monthly')
      `);

      const dates = rows as { process_type: string; last_processed_at: Date }[];
      dates.forEach(row => {
        if (row.process_type === 'daily') {
          this.lastProcessedDaily = new Date(row.last_processed_at);
        } else if (row.process_type === 'monthly') {
          this.lastProcessedMonthly = new Date(row.last_processed_at);
        }
      });

      console.log('最終実行日時を読み込みました:', {
        daily: this.lastProcessedDaily?.toLocaleString('ja-JP'),
        monthly: this.lastProcessedMonthly?.toLocaleString('ja-JP')
      });
    } catch (error) {
      console.error('最終実行日時の読み込み中にエラー:', error);
      throw error;
    }
  }

  private static async updateLastProcessedDate(type: 'daily' | 'monthly') {
    const now = new Date();
    try {
      await pool.query(`
        INSERT INTO last_processed (process_type, last_processed_at)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE last_processed_at = VALUES(last_processed_at)
      `, [type, now]);

      if (type === 'daily') {
        this.lastProcessedDaily = now;
      } else {
        this.lastProcessedMonthly = now;
      }
    } catch (error) {
      console.error('最終実行日時の更新中にエラー:', error);
      throw error;
    }
  }

  private static async checkMissedTasks() {
    const now = new Date();
    now.setHours(now.getHours() + 9); // 日本時間に調整

    // 日次処理の確認
    if (this.lastProcessedDaily) {
      const lastDaily = new Date(this.lastProcessedDaily);
      lastDaily.setHours(lastDaily.getHours() + 9);

      if (lastDaily.getDate() !== now.getDate() ||
          lastDaily.getMonth() !== now.getMonth() ||
          lastDaily.getFullYear() !== now.getFullYear()) {
        console.log('未実行の日次処理を検出しました。実行します...');
        await this.processDailyTasks();
      }
    }

    // 月次処理の確認
    if (this.lastProcessedMonthly) {
      const lastMonthly = new Date(this.lastProcessedMonthly);
      lastMonthly.setHours(lastMonthly.getHours() + 9);

      if (lastMonthly.getMonth() !== now.getMonth() ||
          lastMonthly.getFullYear() !== now.getFullYear()) {
        console.log('未実行の月次処理を検出しました。実行します...');
        await this.processMonthlyTasks();
      }
    }
  }

  private static setupSchedules() {
    // 毎日0時に実行（日本時間）
    cron.schedule('0 0 * * *', () => {
      this.processDailyTasks().catch(error => {
        console.error('日次処理でエラーが発生:', error);
      });
    }, {
      timezone: 'Asia/Tokyo'
    });

    // 毎月1日0時に実行（日本時間）
    cron.schedule('0 0 1 * *', () => {
      this.processMonthlyTasks().catch(error => {
        console.error('月次処理でエラーが発生:', error);
      });
    }, {
      timezone: 'Asia/Tokyo'
    });
  }

  private static async getRanking(): Promise<RankingResults> {
    try {
      const [rows] = await pool.query(`
        SELECT
          user_id,
          username,
          message_count
        FROM
          message_counts
        WHERE
          DATE_FORMAT(date, '%Y-%m') = DATE_FORMAT(CURRENT_DATE, '%Y-%m')
        ORDER BY
          message_count DESC
        LIMIT 3
      `);

      return rows as RankingResults;
    } catch (e) {
      console.error('ERR:'+ e + '\\n');
      throw e;
    }
  }

  static async processDailyTasks() {
    const now = new Date();
    now.setHours(now.getHours() + 9); // 日本時間に調整

    console.log(`日次処理を開始します（${now.toLocaleString('ja-JP')}）`);

    try {
      await MessageTracker.saveMessageCounts();
      await this.updateLastProcessedDate('daily');
      console.log(`日次処理が完了しました（${now.toLocaleString('ja-JP')}）`);

      return {
        success: true,
        processedAt: now.toISOString(),
        type: 'daily'
      };
    } catch (error) {
      console.error('日次処理でエラーが発生:', error);
      throw error;
    }
  }

  static async processMonthlyTasks() {
    const now = new Date();
    now.setHours(now.getHours() + 9); // 日本時間に調整

    console.log(`月次処理を開始します（${now.toLocaleString('ja-JP')}）`);

    if (!this.client) {
      throw new Error('Clientが初期化されていません');
    }

    try {
      const topUsers = ScheduleManager.getRanking();
      const guild = ScheduleManager.client.guilds.cache.first();
      if (!guild) {
        console.error("Guild Not Found")
        return;
      }
      const members = await guild.members.fetch();
      for (const [_, member] of members) {
        for (const roleId of Role) {
          if (member.roles.cache.has(roleId!)) {
            const role = guild.roles.cache.get(roleId!);
            if (role) {
              await member.roles.remove(role);
            }
          }
        }
      }
      for (let i = 0; i < (await topUsers).length && i < Role.length; i++) {
        const member = await guild.members.fetch((await topUsers)[i].user_id).catch(() => null);
        const role = guild.roles.cache.get(Role[i]!);
        if (member && role) {
          await member.roles.add(role);
          console.log(`${member.user.tag}に${i + 1}位のロールを付与しました。`);
        }
      }
      await this.updateLastProcessedDate('monthly');
      console.log(`月次処理が完了しました（${now.toLocaleString('ja-JP')}）`);

      return {
        success: true,
        processedAt: now.toISOString(),
        type: 'monthly'
      };
    } catch (error) {
      console.error('月次処理でエラーが発生:', error);
      throw error;
    }
  }

  static async runTest(type: 'daily' | 'monthly') {
    console.log(`テスト実行を開始します（${type}）`);

    try {
      if (type === 'daily') {
        return await this.processDailyTasks();
      } else {
        return await this.processMonthlyTasks();
      }
    } catch (error) {
      console.error(`${type}処理のテスト実行でエラーが発生:`, error);
      throw error;
    }
  }
}