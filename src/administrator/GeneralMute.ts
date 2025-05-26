import { Context } from 'koishi';
import { Config } from '../config';
import { setGuildMute } from '../mute';

export function GeneralMute(ctx: Context, config: Config ) {
  ctx.command('戒严', { authority: 3 })
    .action(async ({ session }) => {
      if (!session.guildId) {
        return '该指令只能在群组中使用。';
      }
      if (!config.monitoredChannelIds.includes(session.guildId)) {
        return `频道 ${session.guildId} 未被监控，无法执行全体禁言。请先使用 gipas.monitor 添加监控。`;
      }
      try {
        await setGuildMute(session.guildId, true, ctx, config);
        return `已在频道 ${session.guildId} 执行全体禁言。`;
      } catch (error) {
        ctx.logger('gipas').error(`执行 gipas.muteall 指令失败:`, error);
        return `在频道 ${session.guildId} 执行全体禁言失败，请查看日志。`;
      }
    });

  ctx.command('解除戒严', { authority: 3 })
    .action(async ({ session }) => {
      if (!session.guildId) {
        return '该指令只能在群组中使用。';
      }
      // 解除禁言不强制要求频道在监控列表，但通常应该对应
      // if (!config.monitoredChannelIds.includes(session.guildId)) {
      //   return `频道 ${session.guildId} 未被监控，可能无需解除全体禁言。`;
      // }
      try {
        await setGuildMute(session.guildId, false, ctx, config);
        return `已在频道 ${session.guildId} 解除全体禁言。`;
      } catch (error) {
        ctx.logger('gipas').error(`执行 gipas.unmuteall 指令失败:`, error);
        return `在频道 ${session.guildId} 解除全体禁言失败，请查看日志。`;
      }
    });
}