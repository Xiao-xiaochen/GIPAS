import { Context , Session } from 'koishi'
import { Config } from '../../config'
import { ExecutePunishment } from '../../Utils/ExecutePunishment';
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

  // 如果启用了档案系统，扣除用户的监督性评分和积极性评分
  if (config.enabledGroups.includes(session.guildId)) {
    try {
      const userProfile = await ctx.database.get('FileSystem', { 
        userId: session.userId,
        groupId: session.guildId 
      });
      
      if (userProfile && userProfile.length > 0) {
        const profile = userProfile[0];
        
        // 使用AI建议的扣分数量，如果AI没有提供则使用默认值
        let supervisionDeduction = analysisResult.supervisionDeduction;
        let positivityDeduction = analysisResult.positivityDeduction;
        
        // 如果AI没有提供扣分建议，使用默认规则
        if (supervisionDeduction === undefined || positivityDeduction === undefined) {
          switch (analysisResult.level) {
            case 1:
              supervisionDeduction = supervisionDeduction || 5;
              positivityDeduction = positivityDeduction || 2;
              break;
            case 2:
              supervisionDeduction = supervisionDeduction || 15;
              positivityDeduction = positivityDeduction || 5;
              break;
            case 3:
              supervisionDeduction = supervisionDeduction || 30;
              positivityDeduction = positivityDeduction || 10;
              break;
          }
        }
        
        // 计算新的评分，确保不低于0
        const newSupervisionRating = Math.max(0, (profile.supervisionRating || 100) - supervisionDeduction);
        const newPositivityRating = Math.max(0, (profile.positivityRating || 100) - positivityDeduction);
        
        // 更新数据库
        await ctx.database.set('FileSystem', { 
          userId: session.userId,
          groupId: session.guildId 
        }, { 
          supervisionRating: newSupervisionRating,
          positivityRating: newPositivityRating
        });
        
        ctx.logger('gipas').info(`用户 ${session.userId} 因违规扣除评分 - 监督性: -${supervisionDeduction} (${newSupervisionRating}), 积极性: -${positivityDeduction} (${newPositivityRating})`);
      }
    } catch (error) {
      ctx.logger('gipas').error('更新用户档案评分失败:', error);
    }
  }

}