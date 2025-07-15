import { Context } from 'koishi';
import { Config } from '../config';
import { SetGroupMute } from '../Utils/OnebotOperate';

export function GeneralMute(ctx: Context, config: Config ) {
  ctx.command('戒严', { authority: 3 })
    .action(async ({ session }) => {
      if ( !session ) {
        return '无效的会话';
      }

      const guildId = session.guildId;
      if ( !guildId ) {
        return '无效的频道';
      }

      try {
        await SetGroupMute( ctx,session , guildId, true );
        return `已在频道 ${guildId} 执行全体禁言。`;
      } catch (error) {
        ctx.logger('gipas').error(`执行 gipas.muteall 指令失败:`, error);
        return `在频道 ${guildId} 执行全体禁言失败，请查看日志。`;
      }
    });

  ctx.command('解除戒严', { authority: 3 })
    .action(async ({ session }) => {
      if ( !session ) {
        return '无效的会话';
      }

      const guildId = session.guildId;
      if ( !guildId ) {
        return '无效的频道';
      }
      try {
        await SetGroupMute( ctx, session , guildId, false );
        return `已在频道 ${guildId} 解除全体禁言。`;
      } catch (error) {
        ctx.logger('gipas').error(`执行 gipas.unmuteall 指令失败:`, error);
        return `在频道 ${guildId} 解除全体禁言失败，请查看日志。`;
      }
    });
}