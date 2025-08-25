import { Context } from 'koishi';
import { Config } from '../../config';
import { setGroupAdmin } from '../../Utils/Group/GroupAdminManagement';

export function ReelectionPoll(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:reelection-poll');

  // 支持连任命令
  ctx.command('支持连任 <adminUser:user>')
    .action(async ({ session }, adminUser) => {
      if (!session?.guildId || !session?.userId) {
        return '请在群聊中使用此命令';
      }

      if (!adminUser) {
        return '❌ 请@要支持连任的管理员\n💡 使用格式: 支持连任 @管理员';
      }

      return await processReelectionVote(session.guildId, session.userId, adminUser, true);
    });

  // 反对连任命令
  ctx.command('反对连任 <adminUser:user>')
    .action(async ({ session }, adminUser) => {
      if (!session?.guildId || !session?.userId) {
        return '请在群聊中使用此命令';
      }

      if (!adminUser) {
        return '❌ 请@要反对连任的管理员\n💡 使用格式: 反对连任 @管理员';
      }

      return await processReelectionVote(session.guildId, session.userId, adminUser, false);
    });

  // 处理连任投票逻辑
  async function processReelectionVote(guildId: string, voterId: string, adminUserId: string, isSupport: boolean): Promise<string> {
    try {
      // 检查被投票的用户是否是管理员
      const admin = await ctx.database.get('Administrator', {
        userId: adminUserId,
        guildId: guildId,
        isActive: true
      });

      if (admin.length === 0) {
        return '❌ 该用户不是当前管理员';
      }

      const administrator = admin[0];

      // 检查投票者是否有档案
      const voterProfile = await ctx.database.get('FileSystem', {
        userId: voterId,
        groupId: guildId
      });

      if (voterProfile.length === 0) {
        return '❌ 请先填写个人档案才能参与投票\n💡 使用 "申请档案" 命令填写档案';
      }

      // 检查是否已经投过票
      const existingVote = await ctx.database.get('ReelectionVote', {
        adminUserId: adminUserId,
        guildId: guildId,
        voterId: voterId
      });

      if (existingVote.length > 0) {
        return '❌ 您已经对该管理员投过票了';
      }

      // 记录投票
      await ctx.database.create('ReelectionVote', {
        adminUserId: adminUserId,
        guildId: guildId,
        voterId: voterId,
        isSupport: isSupport,
        voteTime: new Date()
      });

      // 获取管理员和投票者信息
      const adminProfile = await ctx.database.get('FileSystem', {
        userId: adminUserId,
        groupId: guildId
      });

      const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
      const voterName = voterProfile[0].realname;

      let message = `✅ 连任投票成功！\n\n`;
      message += `👤 管理员: ${adminName}\n`;
      message += `🗳️ 您的投票: ${isSupport ? '支持连任' : '反对连任'}\n`;
      message += `⏰ 投票时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
      message += `💡 投票已记录，无法修改`;

      // 发送群内通知
      const bot = ctx.bots.find(bot => bot.platform === 'onebot');
      if (bot) {
        const publicMessage = `🗳️ ${voterName} ${isSupport ? '支持' : '反对'} ${adminName} 连任`;
        await bot.sendMessage(guildId, publicMessage);
      }

      logger.info(`用户 ${voterId} ${isSupport ? '支持' : '反对'} 管理员 ${adminUserId} 连任`);
      return message;

    } catch (error) {
      logger.error('连任投票失败:', error);
      return '❌ 投票失败，请稍后重试';
    }
  }

  // 查看连任投票统计命令
  ctx.command('连任投票统计')
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        // 获取所有活跃管理员
        const admins = await ctx.database.get('Administrator', {
          guildId: session.guildId,
          isActive: true
        });

        if (admins.length === 0) {
          return '📊 当前没有活跃的管理员';
        }

        let message = `📊 连任投票统计\n\n`;

        for (const admin of admins) {
          // 获取管理员信息
          const adminProfile = await ctx.database.get('FileSystem', {
            userId: admin.userId,
            groupId: session.guildId
          });

          const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';

          // 获取该管理员的所有投票
          const votes = await ctx.database.get('ReelectionVote', {
            adminUserId: admin.userId,
            guildId: session.guildId
          });

          const supportVotes = votes.filter(v => v.isSupport);
          const opposeVotes = votes.filter(v => !v.isSupport);

          message += `👤 ${adminName} (${admin.classNumber})\n`;
          message += `  ✅ 支持: ${supportVotes.length}票\n`;
          message += `  ❌ 反对: ${opposeVotes.length}票\n`;
          message += `  📊 总票数: ${votes.length}票\n`;
          
          if (votes.length > 0) {
            const supportRate = Math.round((supportVotes.length / votes.length) * 100);
            message += `  📈 支持率: ${supportRate}%\n`;
          }

          // 显示任期信息
          const appointmentTime = new Date(admin.appointmentTime);
          const daysSinceAppointment = Math.floor((new Date().getTime() - appointmentTime.getTime()) / (1000 * 60 * 60 * 24));
          message += `  ⏰ 任期: ${daysSinceAppointment}天\n`;
          
          message += '\n';
        }

        message += `💡 使用 "支持连任 @管理员" 或 "反对连任 @管理员" 进行投票`;

        return message;

      } catch (error) {
        logger.error('查看连任投票统计失败:', error);
        return '❌ 获取投票统计失败';
      }
    });

  // 管理员列表命令
  ctx.command('管理员列表')
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        const admins = await ctx.database.get('Administrator', {
          guildId: session.guildId,
          isActive: true
        });

        if (admins.length === 0) {
          return '👑 当前没有活跃的管理员';
        }

        let message = `👑 当前管理员列表\n\n`;
        message += `📊 管理员总数: ${admins.length}/8\n\n`;

        // 按班级排序
        admins.sort((a, b) => parseInt(a.classNumber) - parseInt(b.classNumber));

        for (const admin of admins) {
          const adminProfile = await ctx.database.get('FileSystem', {
            userId: admin.userId,
            groupId: session.guildId
          });

          const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
          const appointmentTime = new Date(admin.appointmentTime);
          const daysSinceAppointment = Math.floor((new Date().getTime() - appointmentTime.getTime()) / (1000 * 60 * 60 * 24));

          message += `🏫 ${admin.classNumber}: ${adminName}\n`;
          message += `  📅 任职时间: ${appointmentTime.toLocaleDateString('zh-CN')}\n`;
          message += `  ⏰ 任期: ${daysSinceAppointment}天\n`;

          // 获取连任投票统计
          const votes = await ctx.database.get('ReelectionVote', {
            adminUserId: admin.userId,
            guildId: session.guildId
          });

          if (votes.length > 0) {
            const supportVotes = votes.filter(v => v.isSupport).length;
            const supportRate = Math.round((supportVotes / votes.length) * 100);
            message += `  📊 连任支持率: ${supportRate}% (${supportVotes}/${votes.length})\n`;
          }

          message += '\n';
        }

        message += `💡 使用 "连任投票统计" 查看详细投票情况`;

        return message;

      } catch (error) {
        logger.error('查看管理员列表失败:', error);
        return '❌ 获取管理员列表失败';
      }
    });

  // 定期检查连任投票结果（管理员使用）
  ctx.command('检查连任结果', { authority: 4 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        const admins = await ctx.database.get('Administrator', {
          guildId: session.guildId,
          isActive: true
        });

        if (admins.length === 0) {
          return '📊 当前没有活跃的管理员';
        }

        const results = [];
        const adminsToRemove = [];

        for (const admin of admins) {
          const votes = await ctx.database.get('ReelectionVote', {
            adminUserId: admin.userId,
            guildId: session.guildId
          });

          const supportVotes = votes.filter(v => v.isSupport).length;
          const opposeVotes = votes.filter(v => !v.isSupport).length;
          const totalVotes = votes.length;

          // 获取管理员信息
          const adminProfile = await ctx.database.get('FileSystem', {
            userId: admin.userId,
            groupId: session.guildId
          });
          const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';

          // 连任判断逻辑：支持票数必须大于反对票数，且总票数至少为3票
          let reelectionResult = 'pending';
          if (totalVotes >= 3) {
            if (supportVotes > opposeVotes) {
              reelectionResult = 'reelected';
            } else {
              reelectionResult = 'removed';
              adminsToRemove.push({
                userId: admin.userId,
                name: adminName,
                classNumber: admin.classNumber
              });
            }
          }

          results.push({
            userId: admin.userId,
            name: adminName,
            classNumber: admin.classNumber,
            supportVotes,
            opposeVotes,
            totalVotes,
            result: reelectionResult
          });
        }

        // 处理需要卸任的管理员
        for (const adminToRemove of adminsToRemove) {
          // 更新数据库状态
          await ctx.database.set('Administrator', 
            { userId: adminToRemove.userId, guildId: session.guildId }, 
            { isActive: false }
          );

          // 取消QQ群管理员权限
          try {
            await setGroupAdmin(ctx, session.guildId, adminToRemove.userId, false);
            logger.info(`已取消 ${adminToRemove.name} 的QQ群管理员权限`);
          } catch (error) {
            logger.error(`取消 ${adminToRemove.name} 的QQ群管理员权限失败:`, error);
          }

          // 清除该管理员的连任投票记录
          await ctx.database.remove('ReelectionVote', {
            adminUserId: adminToRemove.userId,
            guildId: session.guildId
          });
        }

        // 生成结果报告
        let message = `📊 连任投票结果检查\n\n`;

        for (const result of results) {
          message += `👤 ${result.name} (${result.classNumber})\n`;
          message += `  ✅ 支持: ${result.supportVotes}票\n`;
          message += `  ❌ 反对: ${result.opposeVotes}票\n`;
          message += `  📊 总票数: ${result.totalVotes}票\n`;
          
          switch (result.result) {
            case 'reelected':
              message += `  🎉 结果: 连任成功\n`;
              break;
            case 'removed':
              message += `  ❌ 结果: 连任失败，已卸任\n`;
              break;
            case 'pending':
              message += `  ⏳ 结果: 票数不足，继续投票\n`;
              break;
          }
          message += '\n';
        }

        if (adminsToRemove.length > 0) {
          message += `🔄 已卸任管理员: ${adminsToRemove.map(a => a.name).join(', ')}\n`;
          message += `💡 可以发起新的选举来补充管理员`;
        }

        // 发送群内通知
        if (adminsToRemove.length > 0) {
          const bot = ctx.bots.find(bot => bot.platform === 'onebot');
          if (bot) {
            const publicMessage = `📢 连任投票结果公布\n\n` +
              `❌ 以下管理员连任失败，已卸任:\n` +
              adminsToRemove.map(a => `• ${a.name} (${a.classNumber})`).join('\n') +
              `\n\n🗳️ 将择期举行补选`;
            
            await bot.sendMessage(session.guildId, publicMessage);
          }
        }

        logger.info(`连任投票结果检查完成，卸任管理员: ${adminsToRemove.length}人`);
        return message;

      } catch (error) {
        logger.error('检查连任结果失败:', error);
        return '❌ 检查连任结果失败';
      }
    });

  // 清除连任投票记录命令（管理员使用）
  ctx.command('清除连任投票', { authority: 4 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        const deletedCount = await ctx.database.remove('ReelectionVote', {
          guildId: session.guildId
        });

        logger.info(`清除群组 ${session.guildId} 的连任投票记录: ${deletedCount.removed}条`);
        return `✅ 已清除 ${deletedCount.removed} 条连任投票记录`;

      } catch (error) {
        logger.error('清除连任投票记录失败:', error);
        return '❌ 清除连任投票记录失败';
      }
    });
}