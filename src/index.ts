import {
  Client,
  Events,
  GatewayIntentBits,
  SlashCommandBuilder,
  ChatInputCommandInteraction
} from 'discord.js';
import dotenv from 'dotenv';
import { initializeDatabase } from './database/connection';
import { MessageTracker } from './services/MessageTracker';
import { commands, handleCommands } from './commands/commands';
import { startWebServer } from './web/server';

dotenv.config();

// 開発環境の設定
const isDevelopment = process.env.NODE_ENV === 'development';
const SAVE_INTERVAL = isDevelopment ? 30000 : 3600000; // 開発環境：30秒、本番環境：1時間

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ]
});

// データベースの初期化
initializeDatabase();

// Webサーバーの起動
startWebServer();

client.once(Events.ClientReady, async () => {
  console.log(`${client.user?.tag} が起動しました`);
  console.log(`開発モード: ${isDevelopment ? 'オン' : 'オフ'}`);

  try {
    await client.application?.commands.set(commands);
    console.log('スラッシュコマンドを登録しました');
  } catch (error) {
    console.error('スラッシュコマンドの登録中にエラーが発生しました:', error);
  }

  // 定期的な保存処理の設定
  setInterval(async () => {
    try {
      await MessageTracker.saveMessageCounts();
      await updateRoles(client);
      console.log(`${new Date().toLocaleString('ja-JP')} - メッセージカウントを保存し、ロールを更新しました`);
    } catch (error) {
      console.error('定期保存処理中にエラーが発生しました:', error);
    }
  }, SAVE_INTERVAL);
});

// メッセージの監視
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  await MessageTracker.incrementMessageCount(
    message.author.id,
    message.author.username
  );

  // 開発環境での即時デバッグ出力
  if (isDevelopment) {
    const count = await MessageTracker.getCurrentCount(message.author.id);
    console.log(`${message.author.username}の現在の発言数: ${count}`);
  }
});

// ロールの更新処理
async function updateRoles(client: Client) {
  const today = new Date().toISOString().split('T')[0];
  const topUsers = await MessageTracker.getTopUsers(today);

  const roles = [
    process.env.FIRST_PLACE_ROLE_ID,
    process.env.SECOND_PLACE_ROLE_ID,
    process.env.THIRD_PLACE_ROLE_ID
  ];

  client.guilds.cache.forEach(async (guild) => {
    // 古いロールの削除
    for (const roleId of roles) {
      const role = guild.roles.cache.get(roleId!);
      if (role) {
        const members = role.members;
        for (const member of members.values()) {
          await member.roles.remove(role).catch(console.error);
        }
      }
    }

    // 新しいロールの付与
    for (let i = 0; i < topUsers.length; i++) {
      const user = topUsers[i];
      const roleId = roles[i];
      if (roleId) {
        const member = await guild.members.fetch(user.userId).catch(() => null);
        const role = guild.roles.cache.get(roleId);
        if (member && role) {
          await member.roles.add(role).catch(console.error);
        }
      }
    }
  });
}

// クライアントの起動
client.login(process.env.DISCORD_TOKEN);