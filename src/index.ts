// 最初にdotenvを読み込む
import dotenv from 'dotenv';
import path from 'path';

// dotenvの設定（明示的にパスを指定）
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// 環境変数の存在確認
if (!process.env.DISCORD_TOKEN) {
  console.error('ERROR: DISCORD_TOKENが設定されていません');
  process.exit(1);
}

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
  console.error('ERROR: データベース設定が不完全です');
  console.error('現在の環境変数:', {
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_NAME: process.env.DB_NAME,
    // パスワードはセキュリティのため表示しません
  });
  process.exit(1);
}

import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes
} from 'discord.js';
import { commands, handleCommands } from './commands/commands';
import { ScheduleManager } from './services/ScheduleManager';
import { MessageTracker } from './services/MessageTracker';
import { startWebServer } from './web/server';
import { testConnection } from './database/connection';
import { BatchMessageProcessor } from './services/BatchMessageProcessor';
import { pool } from './database/connection';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// REST APIクライアントの設定
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

// スラッシュコマンドの登録処理
async function registerCommands(clientId: string, guildId?: string) {
  try {
    console.log('スラッシュコマンドの登録を開始します...');

    if (process.env.NODE_ENV === 'development' && guildId) {
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commands }
      );
      console.log(`開発用コマンドを登録しました (Guild ID: ${guildId})`);
    } else {
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log('グローバルコマンドを登録しました');
    }
  } catch (error) {
    console.error('コマンド登録中にエラーが発生しました:', error);
  }
}

// データベース接続テスト
testConnection().catch(console.error);

// インタラクションの処理
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  await handleCommands(interaction);
});

// 起動時の処理
client.once(Events.ClientReady, async () => {
  const now = new Date();
  console.log(`${client.user?.tag} が起動しました（${now.toLocaleString('ja-JP')}）`);

  if (client.user) {
    await registerCommands(
      client.user.id,
      process.env.DEVELOPMENT_GUILD_ID
    );
  }

  // DBが空の場合、今月のメッセージ履歴のみを処理
  try {
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM message_counts');
    if ((rows as any[])[0].count === 0) {
      console.log('データベースが空のため、今月のメッセージ履歴を処理します...');
      await BatchMessageProcessor.processCurrentMonthMessages(client);
    }
  } catch (error) {
    console.error('履歴データの処理中にエラーが発生:', error);
  }

  ScheduleManager.initialize(client);
  console.log('スケジューラーを初期化しました');

  startWebServer();
});

// メッセージ監視
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  try {
    await MessageTracker.incrementMessageCount(message.author.id, message.author.username);
  } catch (error) {
    console.error('メッセージカウント処理中にエラーが発生:', error);
  }
});

// 1時間ごとにメッセージカウントを保存
setInterval(async () => {
  try {
    await MessageTracker.saveMessageCounts();
  } catch (error) {
    console.error('定期保存処理中にエラーが発生:', error);
  }
}, 60 * 60 * 1000); // 1時間 = 60分 × 60秒 × 1000ミリ秒

// ボットの起動
client.login(process.env.DISCORD_TOKEN);