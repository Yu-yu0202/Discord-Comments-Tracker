import { Client } from 'discord.js';
import { MessageTracker } from './MessageTracker';
import schedule from 'node-schedule';
import dotenv from 'dotenv';

dotenv.config();

export class ScheduleManager {
  static initialize(client: Client) {
    // 日次処理 - 毎日0時
    schedule.scheduleJob('0 0 * * *', async () => {
      try {
        await MessageTracker.saveMessageCounts();
        console.log(`${new Date().toLocaleString('ja-JP')} - 日次保存完了`);
      } catch (error) {
        console.error('日次処理エラー:', error);
      }
    });

    // 月次処理 - 毎月1日0時
    schedule.scheduleJob('0 0 1 * *', async () => {
      try {
        const roles = [
          process.env.FIRST_PLACE_ROLE_ID,
          process.env.SECOND_PLACE_ROLE_ID,
          process.env.THIRD_PLACE_ROLE_ID
        ];

        const prevMonth = new Date();
        prevMonth.setMonth(prevMonth.getMonth() - 1);

        const topUsers = await MessageTracker.getMonthlyTopUsers(
          prevMonth.getFullYear(),
          prevMonth.getMonth() + 1
        );

        for (const guild of client.guilds.cache.values()) {
          for (const roleId of roles) {
            const role = guild.roles.cache.get(roleId!);
            if (role) {
              for (const member of role.members.values()) {
                await member.roles.remove(role);
              }
            }
          }

          for (let i = 0; i < topUsers.length && i < roles.length; i++) {
            const member = await guild.members.fetch(topUsers[i].userId).catch(() => null);
            const role = guild.roles.cache.get(roles[i]!);
            if (member && role) {
              await member.roles.add(role);
            }
          }
        }

        console.log(`${new Date().toLocaleString('ja-JP')} - 月次ロール更新完了`);
      } catch (error) {
        console.error('月次処理エラー:', error);
      }
    });
  }
}