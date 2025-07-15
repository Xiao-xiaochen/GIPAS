import { Context , Session } from 'koishi'
import { OneBotBot } from 'koishi-plugin-adapter-onebot'
import { ViolationAnalysisResult } from '../type'



export async function ExecutePunishment( session: Session, ctx: Context , analysisResult: ViolationAnalysisResult,): Promise<string> {
  const UserName = session.author?.name || '未知用户'

  const UserId = session.userId
  if ( !UserId ) {
    return '用户ID不存在'
  }
  const GuildId = session.guildId
  if ( !GuildId ) {
    return '群聊不存在'
  }
  const MessageId = session.messageId
  if ( !MessageId ) {
    return '无效的消息ID'
  }

  const bot = session.bot as unknown as OneBotBot<Context>
  const { action, muteDuration } = analysisResult;
  let outcomeMessage = '未执行任何操作';
  try {
    await bot.deleteMessage( GuildId, MessageId );
    ctx.logger('gipas').info( `已删除违规消息 ${MessageId}` );
  } catch ( error ) {
    ctx.logger('gipas').warn( `删除违规消息 ${MessageId} 失败:`, error );
  }

  switch (action) {
    // 警告级违规
    case 'warn':
      outcomeMessage = `已被警告`;
      break;
    // 禁言级违规
    case 'mute':
      if ( muteDuration && muteDuration > 0 ) {
        const muteMinutes = Math.ceil( muteDuration / 60 );
        try {
          await bot.muteGuildMember( GuildId , UserId, muteDuration * 1000 );
          ctx.logger('gipas').info(`用户 ${UserName} (ID: ${session.userId}) 禁言 ${muteMinutes} 分钟成功。`);
          outcomeMessage = ` 已被禁言 ${muteMinutes} 分钟 `;
        } catch ( error ) {
          ctx.logger('gipas').error( `禁言用户 ${UserName} (ID: ${session.userId}) 失败:`, error );
          outcomeMessage = `尝试禁言失败`;
        }
      } else {
        outcomeMessage = `已被警告 (因禁言时长无效)`;
        ctx.logger('gipas').warn(`请求禁言但时长无效: ${muteDuration}`);
      }
      break;
    // 踢出级违规
    case 'kick':
      try {
        await bot.kickGuildMember( GuildId, UserId );
        ctx.logger('gipas').info(`用户 ${UserName} (ID: ${UserId}) 已被踢出。`);
        outcomeMessage = `已被移出本群`;
      } catch ( error ) {
        ctx.logger('gipas').error(`踢出用户 ${UserName} (ID: ${UserId}) 失败:`, error);
        outcomeMessage = `尝试移出群聊失败`;
      }
      break;
    // 未知的违规等级
    case 'none':
      outcomeMessage = '未执行实际处罚';
      break;
      default:
        ctx.logger('gipas').warn(`未知的处罚动作: ${action}`);
        break;
  }
  return outcomeMessage;
}