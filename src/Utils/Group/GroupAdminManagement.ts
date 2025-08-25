import { Context } from 'koishi';
import { OneBotBot } from 'koishi-plugin-adapter-onebot';

/**
/**
 * 设置群管理员
 * @param ctx Koishi上下文
 * @param guildId 群组ID
 * @param userId 用户ID
 * @param enable 是否设置为管理员（true: 设置, false: 取消）
 */
export async function setGroupAdmin(ctx: Context, guildId: string, userId: string, enable: boolean): Promise<boolean> {
  const logger = ctx.logger('gipas:group-admin');
  
  try {
    // 获取OneBot协议的机器人
    const onebotBot = ctx.bots.find(bot => bot.platform === 'onebot') as OneBotBot<Context>;
    
    if (!onebotBot) {
      logger.error('未找到OneBot协议机器人');
      return false;
    }

    const numericGuildId = Number(guildId);
    const numericUserId = Number(userId);
    
    if (isNaN(numericGuildId) || isNaN(numericUserId)) {
      logger.error('群号或用户ID格式错误');
      return false;
    }

    // 调用OneBot API设置群管理员 - 使用正确的参数格式
    // 调用OneBot API设置群管理员 - 使用正确的参数格式
    await onebotBot.internal.setGroupAdmin(
      numericGuildId,
      numericUserId,
      enable
    );
    
    logger.info(`${enable ? '设置' : '取消'} ${userId} 为群 ${guildId} 的管理员成功`);
    return true;
    
  } catch (error) {
    logger.error(`${enable ? '设置' : '取消'}群管理员失败:`, error);
    return false;
  }
}

/**
 * 批量设置群管理员
 * @param ctx Koishi上下文
 * @param guildId 群组ID
 * @param userIds 用户ID数组
 * @param enable 是否设置为管理员
 */
export async function batchSetGroupAdmin(ctx: Context, guildId: string, userIds: string[], enable: boolean): Promise<{ success: string[], failed: string[] }> {
  const logger = ctx.logger('gipas:group-admin');
  const results = { success: [], failed: [] };
  
  for (const userId of userIds) {
    try {
      const success = await setGroupAdmin(ctx, guildId, userId, enable);
      if (success) {
        results.success.push(userId);
      } else {
        results.failed.push(userId);
      }
      
      // 添加延迟避免API调用过于频繁
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      logger.error(`批量设置管理员 ${userId} 失败:`, error);
      results.failed.push(userId);
    }
  }
  
  return results;
}

/**
 * 获取群管理员列表
 * @param ctx Koishi上下文
 * @param guildId 群组ID
 */
export async function getGroupAdminList(ctx: Context, guildId: string): Promise<string[]> {
  const logger = ctx.logger('gipas:group-admin');
  
  try {
    const onebotBot = ctx.bots.find(bot => bot.platform === 'onebot') as OneBotBot<Context>;
    
    if (!onebotBot) {
      logger.error('未找到OneBot协议机器人');
      return [];
    }

    const numericGuildId = Number(guildId);
    
    if (isNaN(numericGuildId)) {
      logger.error('群号格式错误');
      return [];
    }

    // 获取群成员列表
    const memberList = await onebotBot.internal.getGroupMemberList(numericGuildId);
    
    // 筛选出管理员和群主
    const admins = memberList
      .filter(member => member.role === 'admin' || member.role === 'owner')
      .map(member => member.user_id.toString());
    
    return admins;
    
  } catch (error) {
    logger.error('获取群管理员列表失败:', error);
    return [];
  }
}

/**
 * 检查用户是否为群管理员
 * @param ctx Koishi上下文
 * @param guildId 群组ID
 * @param userId 用户ID
 */
export async function isGroupAdmin(ctx: Context, guildId: string, userId: string): Promise<boolean> {
  try {
    const adminList = await getGroupAdminList(ctx, guildId);
    return adminList.includes(userId);
  } catch (error) {
    ctx.logger('gipas:group-admin').error('检查管理员权限失败:', error);
    return false;
  }
}