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
    )
];

export async function handleCommands(interaction: ChatInputCommandInteraction) {
  if (interaction.commandName === 'ping') {
    const ping = interaction.client.ws.ping;
    await interaction.reply(`🏓 Pong! (${ping}ms)`);
  }

  else if (interaction.commandName === 'status') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const status = await MessageTracker.getUserStatus(targetUser.id);

    if (!status) {
      await interaction.reply(`${targetUser.username}さんの発言記録が見つかりませんでした。`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${targetUser.username}さんの発言状況`)
      .addFields(
        { name: '最終集計日', value: status.date.toLocaleDateString('ja-JP') },
        { name: '発言数', value: status.messageCount.toString() }
      );

    await interaction.reply({ embeds: [embed] });
  }
}