import { Context } from 'koishi';
import { Config } from '../config';
import { ElectionIdParser } from '../Utils/Election/ElectionIdParser';

export function RegularPowerTransfer(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:power-transfer');
  
  // 存储已注册的定时任务
  const registeredJobs = new Map<string, () => void>();

  // 初始化定时权力更替
  function initPowerTransfer() {
    // 清除之前的定时任务
    registeredJobs.forEach(dispose => dispose());
    registeredJobs.clear();

    // 每周一检查管理员数量并发起选举
    const mondayCheckKey = 'monday-admin-check';
    const mondayCheckDispose = ctx.cron('0 0 9 * * 1', async () => {
      await checkAndInitiateElection();
    });
    registeredJobs.set(mondayCheckKey, mondayCheckDispose);

    // 每周对管理员进行连任投票检查
    const weeklyReelectionKey = 'weekly-reelection-check';
    const weeklyReelectionDispose = ctx.cron('0 0 10 * * 1', async () => {
      await checkReelectionNeeded();
    });
    registeredJobs.set(weeklyReelectionKey, weeklyReelectionDispose);

    logger.info('定时权力更替系统已初始化');
  }

  // 检查管理员数量并发起选举
  async function checkAndInitiateElection() {
    try {
      for (const guildId of config.enabledGroups) {
        const activeAdmins = await ctx.database.get('Administrator', {
          guildId,
          isActive: true
        });

        const maxAdmins = 8; // 最多8个班级，最多8位管理员
        
        if (activeAdmins.length < maxAdmins) {
          logger.info(`群组 ${guildId} 当前管理员数量: ${activeAdmins.length}/${maxAdmins}，发起选举`);
          
          // 检查是否已有进行中的选举
          // 检查是否已有进行中的选举
          const allElections = await ctx.database.get('Election', { guildId });
          const ongoingElection = allElections.filter(e => 
            e.status === 'preparation' || e.status === 'candidate_registration' || e.status === 'voting'
          );

          if (ongoingElection.length === 0) {
            await initiateElection(guildId, 'initial');
          } else {
            logger.info(`群组 ${guildId} 已有进行中的选举，跳过`);
          }
        } else {
          logger.info(`群组 ${guildId} 管理员数量充足: ${activeAdmins.length}/${maxAdmins}`);
        }
      }
    } catch (error) {
      logger.error('检查管理员数量失败:', error);
    }
  }

  // 检查是否需要连任投票
  async function checkReelectionNeeded() {
    try {
      for (const guildId of config.enabledGroups) {
        const activeAdmins = await ctx.database.get('Administrator', {
          guildId,
          isActive: true
        });

        for (const admin of activeAdmins) {
          // 检查管理员任期（这里可以根据需要调整检查逻辑）
          const appointmentTime = new Date(admin.appointmentTime);
          const now = new Date();
          const daysSinceAppointment = Math.floor((now.getTime() - appointmentTime.getTime()) / (1000 * 60 * 60 * 24));
          
          // 如果任期超过7天，发起连任投票
          if (daysSinceAppointment >= 7) {
            logger.info(`管理员 ${admin.userId} 需要进行连任投票`);
            await initiateReelectionVote(guildId, admin.userId);
          }
        }
      }
    } catch (error) {
      logger.error('检查连任投票失败:', error);
    }
  }

  // 发起选举
  async function initiateElection(guildId: string, electionType: 'initial' | 'reelection') {
    try {
      const electionId = `election_${guildId}_${Date.now()}`;
      const now = new Date();
      const candidateEndTime = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24小时候选人报名期
      const votingEndTime = new Date(candidateEndTime.getTime() + 48 * 60 * 60 * 1000); // 48小时投票期

      await ctx.database.create('Election', {
        electionId,
        guildId,
        electionType,
        status: 'candidate_registration',
        startTime: now,
        candidateRegistrationEndTime: candidateEndTime,
        votingEndTime: votingEndTime
      });

      // 发送选举通知
      const bot = ctx.bots.find(bot => bot.platform === 'onebot');
      if (bot) {
        const message = `🗳️ 管理员选举开始！\n\n` +
          `📋 选举类型: ${electionType === 'initial' ? '初选' : '连任选举'}\n` +
          `⏰ 候选人报名截止: ${candidateEndTime.toLocaleString('zh-CN')}\n` +
          `🗳️ 投票截止: ${votingEndTime.toLocaleString('zh-CN')}\n\n` +
          `📝 参选条件:\n` +
          `• 已填写个人档案\n` +
          `• 监督性评分 ≥ 90分\n` +
          `• 积极性评分 ≥ 30分\n\n` +
          `💡 使用 "参与竞选" 命令报名参选\n` +
          `💡 使用 "选举状态" 命令查看选举进度`;

        await bot.sendMessage(guildId, message);
      }

      logger.info(`已发起群组 ${guildId} 的${electionType}选举: ${electionId}`);
    } catch (error) {
      logger.error('发起选举失败:', error);
    }
  }

  // 发起连任投票
  async function initiateReelectionVote(guildId: string, adminUserId: string) {
    try {
      // 这里可以实现连任投票逻辑
      // 暂时简化处理
      logger.info(`发起管理员 ${adminUserId} 的连任投票`);
    } catch (error) {
      logger.error('发起连任投票失败:', error);
    }
  }

  // 插件启动时初始化
  ctx.on('ready', () => {
    setTimeout(() => {
      logger.info('初始化定时权力更替系统');
      initPowerTransfer();
    }, 1000);
  });

  // 插件卸载时清理定时任务
  ctx.on('dispose', () => {
    logger.info('清理定时权力更替任务');
    registeredJobs.forEach(dispose => dispose());
    registeredJobs.clear();
  });

  // 手动触发选举命令
  ctx.command('发起选举', { authority: 4 })
    .action(async ({ session }) => {
      if (!session?.guildId) return '请在群聊中使用此命令';
      
      try {
        await initiateElection(session.guildId, 'initial');
        return '✅ 已成功发起管理员选举';
      } catch (error) {
        logger.error('手动发起选举失败:', error);
        return '❌ 发起选举失败，请查看日志';
      }
    });

  // 查看选举状态命令
  ctx.command('选举状态')
    .action(async ({ session }) => {
      if (!session?.guildId) return '请在群聊中使用此命令';
      
      try {
        const allElections = await ctx.database.get('Election', {
          guildId: session.guildId
        });
        const elections = allElections.filter(e => 
          ['preparation', 'candidate_registration', 'voting'].includes(e.status)
        );

        if (elections.length === 0) {
          return '📊 当前没有进行中的选举';
        }

        let statusMessage = '📊 选举状态:\n\n';
        for (const election of elections) {
          const friendlyName = ElectionIdParser.getFriendlyName(election.electionId, election.electionType);
          const shortName = ElectionIdParser.getShortName(election.electionId);
          
          statusMessage += `🗳️ ${friendlyName}\n`;
          statusMessage += `🏷️ 简称: ${shortName}\n`;
          statusMessage += `📍 状态: ${getStatusText(election.status)}\n`;
          
          if (election.candidateRegistrationEndTime) {
            statusMessage += `⏰ 报名截止: ${new Date(election.candidateRegistrationEndTime).toLocaleString('zh-CN')}\n`;
          }
          if (election.votingEndTime) {
            statusMessage += `🗳️ 投票截止: ${new Date(election.votingEndTime).toLocaleString('zh-CN')}\n`;
          }
          statusMessage += '\n';
        }

        return statusMessage;
      } catch (error) {
        logger.error('查看选举状态失败:', error);
        return '❌ 查看选举状态失败';
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