import { Context } from 'koishi';
import { Config } from '../config';

export function GroupTest(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:group-test');

  // 测试获取群成员数量
  ctx.command('测试群人数 [groupId:string]', { authority: 3 })
    .usage('测试获取指定群或当前群的成员数量')
    .action(async ({ session }, groupId) => {
      if (!session?.guildId && !groupId) {
        return '❌ 请在群聊中使用此命令，或提供群号作为参数';
      }

      const targetGroupId = groupId || session.guildId;
      
      try {
        logger.info(`开始测试获取群 ${targetGroupId} 的成员数量`);
        
        // 获取所有机器人
        const bots = ctx.bots;
        let message = `🔍 群成员数量测试 (群ID: ${targetGroupId})\n\n`;
        
        if (bots.length === 0) {
          return '❌ 未找到可用的机器人实例';
        }
        
        message += `🤖 可用机器人: ${bots.length}个\n\n`;
        
        // 尝试使用每个机器人获取群信息
        let successCount = 0;
        
        for (const bot of bots) {
          try {
            message += `📱 机器人 ${bot.selfId} (${bot.platform}):\n`;
            
            if (bot.platform === 'onebot') {
              // 使用getGroupMemberList获取成员列表
              try {
                const memberList = await bot.internal.getGroupMemberList(targetGroupId);
                if (memberList && memberList.length > 0) {
                  message += `  ✅ 成功获取成员列表\n`;
                  message += `  👥 成员数量: ${memberList.length}人\n`;
                  
                  // 统计角色分布
                  const owners = memberList.filter(m => m.role === 'owner').length;
                  const admins = memberList.filter(m => m.role === 'admin').length;
                  const members = memberList.filter(m => m.role === 'member').length;
                  
                  message += `  👑 群主: ${owners}人\n`;
                  message += `  🛡️ 管理员: ${admins}人\n`;
                  message += `  👤 普通成员: ${members}人\n`;
                  
                  successCount++;
                } else {
                  message += `  ❌ 获取成员列表失败: 返回空数据\n`;
                }
              } catch (error) {
                message += `  ❌ 获取成员列表失败: ${error.message}\n`;
              }
            } else {
              message += `  ⚠️ 不支持的平台，无法获取群信息\n`;
            }
          } catch (error) {
            message += `  ❌ 获取群信息失败: ${error.message}\n`;
          }
          
          message += '\n';
        }
        
        if (successCount > 0) {
          message += `✅ 测试完成，成功获取 ${successCount}/${bots.length} 个机器人的群信息`;
        } else {
          message += `❌ 测试完成，所有机器人均未能获取群信息\n\n`;
          message += `💡 可能的原因:\n`;
          message += `1. 机器人不在该群中\n`;
          message += `2. 群号输入错误\n`;
          message += `3. 机器人权限不足\n`;
          message += `4. API调用限制或错误`;
        }
        
        return message;
        
      } catch (error) {
        logger.error(`测试获取群 ${targetGroupId} 成员数量失败:`, error);
        return `❌ 测试失败: ${error.message}`;
      }
    });

  // 测试获取群管理员列表
  ctx.command('测试群管理员 [groupId:string]', { authority: 3 })
    .usage('测试获取指定群或当前群的管理员列表')
    .action(async ({ session }, groupId) => {
      if (!session?.guildId && !groupId) {
        return '❌ 请在群聊中使用此命令，或提供群号作为参数';
      }

      const targetGroupId = groupId || session.guildId;
      
      try {
        logger.info(`开始测试获取群 ${targetGroupId} 的管理员列表`);
        
        // 获取所有机器人
        const bots = ctx.bots;
        let message = `🔍 群管理员测试 (群ID: ${targetGroupId})\n\n`;
        
        if (bots.length === 0) {
          return '❌ 未找到可用的机器人实例';
        }
        
        // 尝试使用每个机器人获取群信息
        let successCount = 0;
        
        for (const bot of bots) {
          try {
            message += `📱 机器人 ${bot.selfId} (${bot.platform}):\n`;
            
            if (bot.platform === 'onebot') {
              // 获取群成员列表
              const memberList = await bot.internal.getGroupMemberList(targetGroupId);
              
              if (memberList && memberList.length > 0) {
                // 筛选出管理员和群主
                const admins = memberList.filter(member => 
                  member.role === 'admin' || member.role === 'owner'
                );
                
                message += `  ✅ 成功获取群成员列表 (共${memberList.length}人)\n`;
                message += `  👮 管理员数量: ${admins.length}人\n\n`;
                
                if (admins.length > 0) {
                  message += `  📋 管理员列表:\n`;
                  admins.forEach(admin => {
                    const roleEmoji = admin.role === 'owner' ? '👑' : '🛡️';
                    message += `  ${roleEmoji} ${admin.nickname || admin.card || '未知'} (${admin.userId})\n`;
                  });
                } else {
                  message += `  ⚠️ 未找到任何管理员\n`;
                }
                
                successCount++;
              } else {
                message += `  ❌ 获取群成员列表失败: 返回空数据\n`;
              }
            } else {
              message += `  ⚠️ 不支持的平台，无法获取群成员列表\n`;
            }
          } catch (error) {
            message += `  ❌ 获取群成员列表失败: ${error.message}\n`;
          }
          
          message += '\n';
        }
        
        if (successCount > 0) {
          message += `✅ 测试完成，成功获取 ${successCount}/${bots.length} 个机器人的群管理员信息`;
        } else {
          message += `❌ 测试完成，所有机器人均未能获取群管理员信息\n\n`;
          message += `💡 可能的原因:\n`;
          message += `1. 机器人不在该群中\n`;
          message += `2. 群号输入错误\n`;
          message += `3. 机器人权限不足\n`;
          message += `4. API调用限制或错误`;
        }
        
        return message;
        
      } catch (error) {
        logger.error(`测试获取群 ${targetGroupId} 管理员列表失败:`, error);
        return `❌ 测试失败: ${error.message}`;
      }
    });
}