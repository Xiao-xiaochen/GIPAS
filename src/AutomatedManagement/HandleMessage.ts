import { Context , Session } from 'koishi'
import { Config } from '../config'
import { ExecutePunishment } from '../Utils/ExecutePunishment';
import { AnalyzeMessage } from './AnalyzeMessage';


// (核心) 消息处理入口
export async function HandleMessage (
  ctx: Context,
  session: Session,
  config: Config,
  rules: string,
  messageHistory: { user: string; content: string; timestamp: Date }[]
) {
  if ( session.userId === session.bot.userId ) {
    return;
  }
  const analysisResult = await AnalyzeMessage(session, ctx, config, rules, messageHistory);
  if (!analysisResult.is_violation) {
    return;
  }

  ctx.logger('gipas').info(`检测到用户 ${session.userId} 违规 (等级 ${analysisResult.level})，详情:`, analysisResult);

  ExecutePunishment(session, ctx , analysisResult).then(outcomeMessage => {
    // 如果动作不是 'none'，则发送通告
    if ( analysisResult.action !== 'none' ) {
      const userName = session.author?.name || session.author?.nick || session.userId;
      const announcement = [
        `====[违规通告]====`,
        `G.I.P.A.S.`,
        `违规用户: ${userName} (${session.userId})`,
        `违规原因: ${analysisResult.reason}`,
        `违规等级: ${analysisResult.level}`,
        `执行结果: ${outcomeMessage}`
      ].join('\n');
      session.send(announcement);
    }
  });

  // 记录到数据库
  try {
    await ctx.database.create('ViolationRecord', {
      userId: session.userId,
      guildId: session.guildId,
      MessageContent: session.content,
      timestamp: new Date(),
      violationLevel: analysisResult.level,
      actionTaken: `${analysisResult.action || 'none'}`
    });
  } catch( error ) {
    ctx.logger( 'gipas' ).error( '记录违规信息到数据库失败:', error );
  };

}