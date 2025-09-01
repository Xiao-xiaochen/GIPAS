import { Context } from 'koishi';
import { Config } from '../config';

export function PowerTransfer(ctx: Context, config: Config) {
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

        const maxAdmins = 8;
        
        if (activeAdmins.length < maxAdmins) {
          logger.info(`群组 ${guildId} 当前管理员数量: ${activeAdmins.length}/${maxAdmins}，发起选举`);
          
          // 分别查询不同状态的选举
          const preparationElections = await ctx.database.get('Election', { guildId, status: 'preparation' });
          const registrationElections = await ctx.database.get('Election', { guildId, status: 'candidate_registration' });
          const votingElections = await ctx.database.get('Election', { guildId, status: 'voting' });
          const ongoingElection = [...preparationElections, ...registrationElections, ...votingElections];

          if (ongoingElection.length === 0) {
            await initiateElection(guildId, 'initial');
          } else {
            logger.info(`群组 ${guildId} 已有进行中的选举，跳过`);
          }
        }
      }
    } catch (error) {
      logger.error('检查管理员数量时出错:', error);
    }
  }

  // 发起选举
  async function initiateElection(guildId: string, electionType: 'initial' | 'reelection') {
    try {
      const candidateEndTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const votingEndTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      const electionId = `election_${Date.now()}`;
      const election = await ctx.database.create('Election', {
        electionId,
        guildId,
        electionType,
        status: 'candidate_registration',
        candidateRegistrationEndTime: candidateEndTime,
        votingEndTime: votingEndTime,
        startTime: new Date()
      });

      const message = `🗳️ 管理员选举开始！\n\n` +
        `📋 选举类型: ${electionType === 'initial' ? '初选' : '连任选举'}\n` +
        `⏰ 候选人报名截止: ${candidateEndTime.toLocaleString('zh-CN')}\n` +
        `🗳️ 投票截止: ${votingEndTime.toLocaleString('zh-CN')}\n\n` +
        `💡 使用 "参选" 命令报名参选\n💡 使用 "选举状态" 查看选举进度`;

      const bot = ctx.bots.find(bot => bot.platform === 'onebot');
      if (bot) {
        await bot.sendMessage(guildId, message);
      }

      logger.info(`已在群组 ${guildId} 发起${electionType}选举，ID: ${election.electionId}`);
    } catch (error) {
      logger.error('发起选举时出错:', error);
    }
  }

  // 启动系统
  initPowerTransfer();

  // 清理函数
  ctx.on('dispose', () => {
    registeredJobs.forEach(dispose => dispose());
    registeredJobs.clear();
    logger.info('定时权力更替系统已停止');
  });

  logger.info('定时权力更替系统已启动');
}