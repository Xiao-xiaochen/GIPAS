import { Context, h } from 'koishi'
import { Config } from '../../config'

// 存储用户今日点赞记录 格式: "fromUserId:toUserId:date" -> true
const dailyPraiseRecords = new Map<string, boolean>();

export function ZanSystem(ctx: Context, config: Config) {
  const logger = ctx.logger('zan-system')

  // 赞功能
  ctx.command('赞 [targetUser:user]', '给指定用户点赞，增加其积极性评分')
    .action(async ({ session }, targetUser) => {
      const { userId, guildId } = session

      if (!guildId || !config.enabledGroups.includes(guildId)) {
        return '本群未启用同学档案功能。'
      }

      let targetUserId: string | null = null;
      
      if (targetUser) {
        logger.info(`原始targetUser: ${targetUser}`);
        if (typeof targetUser === 'string') {
          const parts = targetUser.split(':');
          targetUserId = parts[parts.length - 1];
        }
        logger.info(`解析后targetUserId: ${targetUserId}`);
      } else {
        return '请指定要点赞的用户，例如：赞 @用户名'
      }

      if (!targetUserId) {
        return '请指定要点赞的用户，例如：赞 @用户名'
      }

      // 不能给自己点赞
      if (targetUserId === userId) {
        return '不能给自己点赞哦！'
      }

      // 检查今日是否已经给该用户点赞
      const today = new Date().toDateString();
      const recordKey = `${userId}:${targetUserId}:${today}`;
      
      if (dailyPraiseRecords.has(recordKey)) {
        return '你今天已经给这个用户点过赞了，明天再来吧！'
      }

      // 检查目标用户是否有档案
      const targetProfile = await ctx.database.get('FileSystem', { 
        userId: targetUserId,
        groupId: guildId 
      });

      if (!targetProfile || targetProfile.length === 0) {
        return '该用户还没有创建档案，无法点赞。'
      }

      // 检查点赞者是否有档案
      const userProfile = await ctx.database.get('FileSystem', { 
        userId: userId,
        groupId: guildId 
      });

      if (!userProfile || userProfile.length === 0) {
        return '你还没有创建档案，请先使用"申请档案"创建后再点赞。'
      }

      try {
        const profile = targetProfile[0];
        
        // 增加积极性评分1分，最高不超过100分
        const newPositivityRating = Math.min(100, (profile.positivityRating || 100) + 1);
        
        // 更新数据库
        await ctx.database.set('FileSystem', { 
          userId: targetUserId,
          groupId: guildId 
        }, { 
          positivityRating: newPositivityRating
        });

        // 记录今日点赞
        dailyPraiseRecords.set(recordKey, true);

        // 获取目标用户的昵称
        let targetUserName = '该用户';
        try {
          const targetUserInfo = await session.bot.getUser(targetUserId);
          targetUserName = targetUserInfo?.name || targetUserInfo?.nick || '该用户';
        } catch (error) {
          targetUserName = '该用户';
        }

        logger.info(`用户 ${userId} 给用户 ${targetUserId} 点赞，积极性评分 +1 (${newPositivityRating})`);
        
        return h.at(userId) + ` 成功给 ${targetUserName} 点赞！其积极性评分 +1 (当前: ${newPositivityRating}分)`

      } catch (error) {
        logger.error('点赞操作失败:', error);
        return '点赞失败，请稍后再试。'
      }
    })

  // 定时清理过期的点赞记录（每天凌晨清理）
  ctx.cron('0 0 * * *', () => {
    const today = new Date().toDateString();
    const keysToDelete: string[] = [];
    
    for (const [key] of dailyPraiseRecords) {
      const keyDate = key.split(':')[2];
      if (keyDate !== today) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => dailyPraiseRecords.delete(key));
    logger.info(`清理了 ${keysToDelete.length} 条过期点赞记录`);
  });
}