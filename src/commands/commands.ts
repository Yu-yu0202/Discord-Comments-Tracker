import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ApplicationCommandDataResolvable
} from 'discord.js';
import { MessageTracker } from '../services/MessageTracker';

export const commands: ApplicationCommandDataResolvable[] = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Botのping値を表示します')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('ユーザーの月間発言数を表示します')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('確認したいユーザー')
        .setRequired(false)
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('debug_save')
    .setDescription('現在のメッセージカウントを保存します（開発用）')
    .toJSON()
];

export async function handleCommands(interaction: ChatInputCommandInteraction) {
  if (interaction.commandName === 'ping') {
    const ping = interaction.client.ws.ping;
    await interaction.reply({
      content: `🏓 Pong! (${ping}ms)`,
      ephemeral: true
    });
  }

  else if (interaction.commandName === 'status') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const status = await MessageTracker.getUserStatus(targetUser.id);

      const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${targetUser.username}さんの月間発言状況`)
        .addFields(
          {
            name: '期間',
            value: `${status.year}年${status.month}月`
          },
          {
            name: '今月の発言数',
            value: status.messageCount.toString()
          }
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('ステータス取得中にエラー:', error);
      await interaction.editReply('ステータスの取得に失敗しました');
    }
  }

  else if (interaction.commandName === 'debug_save') {
    await interaction.deferReply({ ephemeral: true });
    try {
      await MessageTracker.saveMessageCounts();
      await interaction.editReply('メッセージカウントを保存しました');
    } catch (error) {
      console.error('保存中にエラー:', error);
      await interaction.editReply('保存処理中にエラーが発生しました');
    }
  }
}