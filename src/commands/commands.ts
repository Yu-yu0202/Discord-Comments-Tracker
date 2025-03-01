import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder
} from 'discord.js';
import { MessageTracker } from '../services/MessageTracker';

export const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Botのping値を表示します'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('ユーザーの発言数を表示します')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('確認したいユーザー')
        .setRequired(false)
    ),

  // 開発環境専用のデバッグコマンド
  process.env.NODE_ENV === 'development' ?
    new SlashCommandBuilder()
      .setName('debug_save')
      .setDescription('現在のメッセージカウントを即時保存します（開発環境のみ）')
  : null
].filter(Boolean);

export async function handleCommands(interaction: ChatInputCommandInteraction) {
  if (interaction.commandName === 'ping') {
    const ping = interaction.client.ws.ping;
    await interaction.reply(`🏓 Pong! (${ping}ms)`);
  }

  else if (interaction.commandName === 'status') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const status = await MessageTracker.getUserStatus(targetUser.id);

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${targetUser.username}さんの発言状況`)
      .addFields(
        { name: '日付', value: new Date(status.date).toLocaleDateString('ja-JP') },
        { name: '発言数', value: status.messageCount.toString() }
      );

    await interaction.reply({ embeds: [embed] });
  }

  else if (process.env.NODE_ENV === 'development' && interaction.commandName === 'debug_save') {
    try {
      await MessageTracker.saveMessageCounts();
      await interaction.reply('メッセージカウントを保存しました。');
    } catch (error) {
      console.error(error);
      await interaction.reply('保存処理中にエラーが発生しました。');
    }
  }
}