import { Context } from 'koishi';
import { Config } from '../config';
import { batchSetGroupAdmin } from '../Utils/GroupAdminManagement';

export function ElectionManagement(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:election-management');

  // 同步管理员权限命令
  ctx.command('同步管理员', { authority: 4 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        // 获取数据库中的活跃管理员
        const dbAdmins = await ctx.database.get('Administrator', {
          guildId: session.guildId,
          isActive: true
        });

        if (dbAdmins.length === 0) {
          return '📊 数据库中没有活跃的管理员记录';
        }

        // 检查QQ群实际管理员状态
        const bot = ctx.bots.find(bot => bot.platform === 'onebot');
        if (!bot) {
          return '❌ 未找到OneBot协议的机器人';
        }

        let message = `🔍 管理员权限同步检查\n\n`;
        message += `📊 数据库管理员数量: ${dbAdmins.length}\n\n`;

        const syncNeeded = [];
        const syncErrors = [];

        for (const admin of dbAdmins) {
          const adminProfile = await ctx.database.get('FileSystem', {
            userId: admin.userId,
            groupId: session.guildId
          });

          const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';

          try {
            // 这里可以检查实际的QQ群管理员状态
            // 由于API限制，我们假设需要同步
            syncNeeded.push({
              userId: admin.userId,
              name: adminName,
              classNumber: admin.classNumber
            });

            message += `✅ ${adminName} (${admin.classNumber}) - 需要同步\n`;
          } catch (error) {
            syncErrors.push({
              userId: admin.userId,
              name: adminName,
              error: error.message
            });
            message += `❌ ${adminName} (${admin.classNumber}) - 检查失败\n`;
          }
        }

        if (syncNeeded.length > 0) {
          message += `\n💡 使用 "执行同步" 命令来同步权限`;
        }

        if (syncErrors.length > 0) {
          message += `\n⚠️ ${syncErrors.length} 个管理员检查失败`;
        }

        return message;

      } catch (error) {
        logger.error('同步管理员权限检查失败:', error);
        return '❌ 检查管理员权限失败';
      }
    });

  // 执行权限同步命令
  ctx.command('执行同步', { authority: 4 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        const dbAdmins = await ctx.database.get('Administrator', {
          guildId: session.guildId,
          isActive: true
        });

        if (dbAdmins.length === 0) {
          return '❌ 没有需要同步的管理员';
        }

        const adminUserIds = dbAdmins.map(admin => admin.userId);

        // 批量设置管理员权限
        const syncResults = await batchSetGroupAdmin(ctx, session.guildId, adminUserIds, true);

        let message = `🔄 管理员权限同步完成\n\n`;
        
        if (syncResults.success.length > 0) {
          message += `✅ 成功同步: ${syncResults.success.length}人\n`;
          for (const userId of syncResults.success) {
            const admin = dbAdmins.find(a => a.userId === userId);
            if (admin) {
              const adminProfile = await ctx.database.get('FileSystem', {
                userId: admin.userId,
                groupId: session.guildId
              });
              const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
              message += `  • ${adminName} (${admin.classNumber})\n`;
            }
          }
        }

        if (syncResults.failed.length > 0) {
          message += `\n❌ 同步失败: ${syncResults.failed.length}人\n`;
          for (const userId of syncResults.failed) {
            const admin = dbAdmins.find(a => a.userId === userId);
            if (admin) {
              const adminProfile = await ctx.database.get('FileSystem', {
                userId: admin.userId,
                groupId: session.guildId
              });
              const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
              message += `  • ${adminName} (${admin.classNumber})\n`;
            }
          }
        }

        logger.info(`管理员权限同步完成: 成功${syncResults.success.length}人, 失败${syncResults.failed.length}人`);
        return message;

      } catch (error) {
        logger.error('执行管理员权限同步失败:', error);
        return '❌ 执行权限同步失败';
      }
    });

  // 选举系统状态命令
  ctx.command('选举系统状态', { authority: 4 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        // 获取选举信息
        const elections = await ctx.database.get('Election', {
          guildId: session.guildId
        });

        // 获取管理员信息
        const admins = await ctx.database.get('Administrator', {
          guildId: session.guildId,
          isActive: true
        });

        // 获取候选人信息
        const candidates = await ctx.database.get('ElectionCandidate', {
          guildId: session.guildId
        });

        // 获取投票信息
        const votes = await ctx.database.get('ElectionVote', {
          guildId: session.guildId
        });

        // 获取连任投票信息
        const reelectionVotes = await ctx.database.get('ReelectionVote', {
          guildId: session.guildId
        });

        let message = `📊 选举系统状态总览\n\n`;

        // 管理员状态
        message += `👑 管理员状态:\n`;
        message += `  • 当前管理员: ${admins.length}/8人\n`;
        
        if (admins.length > 0) {
          const adminsByClass = new Map();
          for (const admin of admins) {
            adminsByClass.set(admin.classNumber, (adminsByClass.get(admin.classNumber) || 0) + 1);
          }
          message += `  • 班级分布: `;
          const classDistribution = Array.from(adminsByClass.entries())
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .map(([classNum, count]) => `${classNum}(${count}人)`)
            .join(', ');
          message += classDistribution + '\n';
        }

        // 选举状态
        message += `\n🗳️ 选举状态:\n`;
        message += `  • 历史选举: ${elections.length}次\n`;
        
        const ongoingElections = elections.filter(e => 
          e.status === 'preparation' || e.status === 'candidate_registration' || e.status === 'voting'
        );
        
        if (ongoingElections.length > 0) {
          message += `  • 进行中选举: ${ongoingElections.length}次\n`;
          for (const election of ongoingElections) {
            message += `    - ${election.electionId}: ${getStatusText(election.status)}\n`;
          }
        } else {
          message += `  • 进行中选举: 无\n`;
        }

        // 候选人状态
        message += `\n📋 候选人状态:\n`;
        message += `  • 历史候选人: ${candidates.length}人\n`;
        
        const activeCandidates = candidates.filter(c => c.isApproved);
        if (activeCandidates.length > 0) {
          message += `  • 当前候选人: ${activeCandidates.length}人\n`;
          const candidatesByClass = new Map();
          for (const candidate of activeCandidates) {
            candidatesByClass.set(candidate.classNumber, (candidatesByClass.get(candidate.classNumber) || 0) + 1);
          }
          const candidateDistribution = Array.from(candidatesByClass.entries())
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .map(([classNum, count]) => `${classNum}(${count}人)`)
            .join(', ');
          message += `  • 班级分布: ${candidateDistribution}\n`;
        }

        // 投票状态
        message += `\n🗳️ 投票状态:\n`;
        message += `  • 历史投票: ${votes.length}票\n`;
        message += `  • 连任投票: ${reelectionVotes.length}票\n`;

        const publicVotes = votes.filter(v => v.isPublic).length;
        const privateVotes = votes.filter(v => !v.isPublic).length;
        if (votes.length > 0) {
          message += `  • 公开投票: ${publicVotes}票\n`;
          message += `  • 私密投票: ${privateVotes}票\n`;
        }

        // 系统健康状态
        message += `\n🔧 系统状态:\n`;
        message += `  • 数据库连接: ✅ 正常\n`;
        message += `  • OneBot连接: ${ctx.bots.find(bot => bot.platform === 'onebot') ? '✅ 正常' : '❌ 异常'}\n`;
        message += `  • 启用群组: ${config.enabledGroups.length}个\n`;

        return message;

      } catch (error) {
        logger.error('获取选举系统状态失败:', error);
        return '❌ 获取系统状态失败';
      }
    });

  // 强制结束选举命令
  ctx.command('强制结束选举', { authority: 4 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        const allElections = await ctx.database.get('Election', {
          guildId: session.guildId
        });
        const ongoingElections = allElections.filter(e => 
          e.status === 'preparation' || e.status === 'candidate_registration' || e.status === 'voting'
        );

        if (ongoingElections.length === 0) {
          return '❌ 没有进行中的选举';
        }

        let cancelledCount = 0;
        for (const election of ongoingElections) {
          await ctx.database.set('Election', { id: election.id }, {
            status: 'cancelled'
          });
          cancelledCount++;
        }

        // 发送群内通知
        const bot = ctx.bots.find(bot => bot.platform === 'onebot');
        if (bot) {
          const message = `📢 管理员强制结束了进行中的选举\n\n` +
            `❌ 已取消 ${cancelledCount} 个选举\n` +
            `💡 如需重新选举，请使用 "发起选举" 命令`;
          
          await bot.sendMessage(session.guildId, message);
        }

        logger.info(`强制结束群组 ${session.guildId} 的 ${cancelledCount} 个选举`);
        return `✅ 已强制结束 ${cancelledCount} 个进行中的选举`;

      } catch (error) {
        logger.error('强制结束选举失败:', error);
        return '❌ 强制结束选举失败';
      }
    });

  // 清理选举数据命令
  ctx.command('清理选举数据', { authority: 4 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        // 清理已完成或已取消的选举数据（保留最近3次）
        const elections = await ctx.database.get('Election', {
          guildId: session.guildId
        });

        const completedElections = elections
          .filter(e => e.status === 'completed' || e.status === 'cancelled')
          .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

        if (completedElections.length <= 3) {
          return '📊 选举数据较少，无需清理';
        }

        const electionsToDelete = completedElections.slice(3);
        let deletedElections = 0;
        let deletedCandidates = 0;
        let deletedVotes = 0;

        for (const election of electionsToDelete) {
          // 删除相关候选人记录
          const candidateResult = await ctx.database.remove('ElectionCandidate', {
            electionId: election.electionId
          });
          deletedCandidates += candidateResult.removed || 0;

          // 删除相关投票记录
          const voteResult = await ctx.database.remove('ElectionVote', {
            electionId: election.electionId
          });
          deletedVotes += voteResult.removed || 0;

          // 删除选举记录
          await ctx.database.remove('Election', {
            id: election.id
          });
          deletedElections++;
        }

        let message = `🧹 选举数据清理完成\n\n`;
        message += `🗳️ 删除选举: ${deletedElections}个\n`;
        message += `📋 删除候选人: ${deletedCandidates}人\n`;
        message += `🗳️ 删除投票: ${deletedVotes}票\n\n`;
        message += `💡 保留了最近3次选举的数据`;

        logger.info(`清理群组 ${session.guildId} 的选举数据: 选举${deletedElections}个, 候选人${deletedCandidates}人, 投票${deletedVotes}票`);
        return message;

      } catch (error) {
        logger.error('清理选举数据失败:', error);
        return '❌ 清理选举数据失败';
      }
    });

  // 获取状态文本
  function getStatusText(status: string): string {
    switch (status) {
      case 'preparation': return '准备中';
      case 'candidate_registration': return '候选人报名中';
      case 'voting': return '投票中';
      case 'completed': return '已完成';
      case 'cancelled': return '已取消';
      default: return '未知状态';
    }
  }
}