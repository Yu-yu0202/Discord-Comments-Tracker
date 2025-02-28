import { Client, Events, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import { initializeDatabase } from './database/connection';
import { MessageTracker } from './services/MessageTracker';
import { commands, handleCommands } from './commands/commands';
import { startWebServer } from './web/server';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// データベースの初期化
initializeDatabase();

// Webサーバーの起動
startWebServer();

client.once(Events.ClientReady, async () => {
  console.log(`${client.user?.tag} が起動しました`);

  // スラッシュコマンドの登録
  try {
    await client.application?.commands.set(commands);
    console.log('スラッシュコマンドを登録しました');
  } catch (error) {
    console.error('スラッシュコマンドの登録中にエラーが発生しました:', error);
  }

  // 定期的なメッセージカウントの保存（1時間ごと）
  setInterval(async () => {
    await MessageTracker.saveMessageCounts();
    await updateRoles(client);
  }, 3600000);
});

// メッセージの監視
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  await MessageTracker.incrementMessageCount(
    message.author.id,
    message.author.username
  );
});

// スラッシュコマンドの処理
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await handleCommands(interaction);
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
    // 古いロールを削除
    roles.forEach(async (roleId) => {
      const role = guild.roles.cache.get(roleId!);
      if (role) {
        const members = role.members;
        members.forEach(member => {
          member.roles.remove(role).catch(console.error);
        });
      }
    });

    // 新しいロールを付与
    topUsers.forEach(async (user, index) => {
      const member = await guild.members.fetch(user.userId).catch(() => null);
      if (member && roles[index]) {
        const role = guild.roles.cache.get(roles[index]!);
        if (role) {
          member.roles.add(role).catch(console.error);
        }
      }
    });
  });
}

client.login(process.env.DISCORD_TOKEN);