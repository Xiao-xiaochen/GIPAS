import { Context } from 'koishi';
import { Config } from '../config';
import { setGroupAdmin, isGroupAdmin, getGroupAdminList } from '../Utils/Group/GroupAdminManagement';

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

        const maxAdmins = 8;
        
        if (activeAdmins.length < maxAdmins) {
          logger.info(`群组 ${guildId} 当前管理员数量: ${activeAdmins.length}/${maxAdmins}，发起选举`);
          
          const allElections = await ctx.database.get('Election', { guildId });
          const ongoingElection = allElections.filter(e => 
            e.status === 'preparation' || e.status === 'candidate_registration' || e.status === 'voting'
          );

          if (ongoingElection.length === 0) {
            await initiateElection(guildId, 'initial');
          } else {
            logger.info(`群组 ${guildId} 已有进行中的选举，跳过`);
          }
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
          const appointmentTime = new Date(admin.appointmentTime);
          const now = new Date();
          const daysSinceAppointment = Math.floor((now.getTime() - appointmentTime.getTime()) / (1000 * 60 * 60 * 24));
          
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
      const candidateEndTime = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const votingEndTime = new Date(candidateEndTime.getTime() + 48 * 60 * 60 * 1000);

      await ctx.database.create('Election', {
        electionId,
        guildId,
        electionType,
        status: 'candidate_registration',
        startTime: now,
        candidateRegistrationEndTime: candidateEndTime,
        votingEndTime: votingEndTime
      });

      const bot = ctx.bots.find(bot => bot.platform === 'onebot');
      if (bot) {
        const message = `🗳️ 管理员选举开始！\n\n` +
          `📋 选举类型: ${electionType === 'initial' ? '初选' : '连任选举'}\n` +
          `⏰ 候选人报名截止: ${candidateEndTime.toLocaleString('zh-CN')}\n` +
          `🗳️ 投票截止: ${votingEndTime.toLocaleString('zh-CN')}\n\n` +
          `📝 参选条件:\n• 已填写个人档案\n• 监督性评分 ≥ 90分\n• 积极性评分 ≥ 30分\n\n` +
          `💡 使用 "参与竞选" 命令报名参选\n💡 使用 "选举状态" 命令查看选举进度`;

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
      const adminInfo = await ctx.database.get('Administrator', {
        userId: adminUserId,
        guildId: guildId,
        isActive: true
      });

      if (adminInfo.length === 0) {
        logger.warn(`管理员 ${adminUserId} 不存在或已非活跃状态`);
        return;
      }

      const admin = adminInfo[0];
      
      const adminProfile = await ctx.database.get('FileSystem', {
        userId: adminUserId,
        groupId: guildId
      });

      const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
      
      const existingVotes = await ctx.database.get('ReelectionVote', {
        adminUserId: adminUserId,
        guildId: guildId
      });

      if (existingVotes.length > 0) {
        logger.info(`管理员 ${adminUserId} 已有连任投票记录，跳过`);
        return;
      }

      const bot = ctx.bots.find(bot => bot.platform === 'onebot');
      if (bot) {
        const appointmentTime = new Date(admin.appointmentTime);
        const daysSinceAppointment = Math.floor((new Date().getTime() - appointmentTime.getTime()) / (1000 * 60 * 60 * 24));
        
        const message = `🗳️ 管理员连任投票开始！\n\n` +
          `👤 管理员: ${adminName} (${admin.classNumber})\n` +
          `📅 任职时间: ${appointmentTime.toLocaleDateString('zh-CN')}\n` +
          `⏰ 任期: ${daysSinceAppointment}天\n\n` +
          `📊 连任投票规则:\n• 需要至少3票才能生效\n• 支持票数 > 反对票数 = 连任成功\n` +
          `• 反对票数 ≥ 支持票数 = 连任失败，自动卸任\n• 只有已填写档案的成员可以投票\n• 每人只能投票一次\n\n` +
          `💡 使用 "支持连任 @${adminName}" 支持连任\n💡 使用 "反对连任 @${adminName}" 反对连任\n💡 使用 "连任投票统计" 查看投票情况`;

        await bot.sendMessage(guildId, message);
      }

      logger.info(`已发起管理员 ${adminUserId} (${adminName}) 的连任投票`);
      
      const checkKey = `reelection-check-${adminUserId}-${guildId}`;
      const checkDispose = ctx.cron(`0 0 10 * * *`, async () => {
        await checkSingleAdminReelection(guildId, adminUserId);
      });
      registeredJobs.set(checkKey, checkDispose);

    } catch (error) {
      logger.error('发起连任投票失败:', error);
    }
  }

  // 检查单个管理员的连任结果
  async function checkSingleAdminReelection(guildId: string, adminUserId: string) {
    try {
      const votes = await ctx.database.get('ReelectionVote', {
        adminUserId: adminUserId,
        guildId: guildId
      });

      const supportVotes = votes.filter(v => v.isSupport).length;
      const opposeVotes = votes.filter(v => !v.isSupport).length;
      const totalVotes = votes.length;

      const adminProfile = await ctx.database.get('FileSystem', {
        userId: adminUserId,
        groupId: guildId
      });
      const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';

      if (totalVotes >= 3) {
        if (supportVotes > opposeVotes) {
          logger.info(`管理员 ${adminUserId} (${adminName}) 连任成功`);
          
          const bot = ctx.bots.find(bot => bot.platform === 'onebot');
          if (bot) {
            const message = `🎉 连任投票结果公布\n\n` +
              `👤 管理员: ${adminName}\n✅ 支持: ${supportVotes}票\n❌ 反对: ${opposeVotes}票\n📊 总票数: ${totalVotes}票\n\n` +
              `🎊 结果: 连任成功！\n💡 感谢大家的支持与信任`;
            
            await bot.sendMessage(guildId, message);
          }
          
          await ctx.database.remove('ReelectionVote', {
            adminUserId: adminUserId,
            guildId: guildId
          });
          
        } else {
          await executeAdminRemoval(guildId, adminUserId, adminName, supportVotes, opposeVotes, totalVotes, false);
        }
      } else if (totalVotes > 0) {
        logger.info(`管理员 ${adminUserId} (${adminName}) 连任投票票数不足 (${totalVotes}/3)，继续等待`);
      }

    } catch (error) {
      logger.error(`检查管理员 ${adminUserId} 连任结果失败:`, error);
    }
  }

  // 执行管理员卸任
  async function executeAdminRemoval(guildId: string, adminUserId: string, adminName: string, supportVotes: number, opposeVotes: number, totalVotes: number, isImpeachment: boolean = false) {
    try {
      await ctx.database.set('Administrator', 
        { userId: adminUserId, guildId: guildId }, 
        { isActive: false }
      );

      try {
        await setGroupAdmin(ctx, guildId, adminUserId, false);
        logger.info(`已取消 ${adminName} 的QQ群管理员权限`);
      } catch (error) {
        logger.error(`取消 ${adminName} 的QQ群管理员权限失败:`, error);
      }

      await ctx.database.remove('ReelectionVote', {
        adminUserId: adminUserId,
        guildId: guildId
      });

      const bot = ctx.bots.find(bot => bot.platform === 'onebot');
      if (bot) {
        const resultType = isImpeachment ? '弹劾' : '连任';
        const resultText = isImpeachment ? '弹劾成功' : '连任失败';
        
        const message = `📢 ${resultType}投票结果公布\n\n` +
          `👤 管理员: ${adminName}\n✅ 支持${isImpeachment ? '留任' : '连任'}: ${supportVotes}票\n` +
          `❌ ${isImpeachment ? '支持弹劾' : '反对连任'}: ${opposeVotes}票\n📊 总票数: ${totalVotes}票\n\n` +
          `❌ 结果: ${resultText}，已自动卸任\n🗳️ 将择期举行补选以填补空缺`;
        
        await bot.sendMessage(guildId, message);
      }

      logger.info(`管理员 ${adminUserId} (${adminName}) ${isImpeachment ? '弹劾成功' : '连任失败'}，已执行卸任`);

      setTimeout(async () => {
        await checkAndInitiateElection();
      }, 5000);

    } catch (error) {
      logger.error(`执行管理员 ${adminUserId} 卸任失败:`, error);
    }
  }

  // 群员发起弹劾投票命令
  ctx.command('发起弹劾 <adminUser:user>')
    .usage('发起对管理员的弹劾投票\n需要满足一定条件才能发起')
    .action(async ({ session }, adminUser) => {
      if (!session?.guildId || !session?.userId) {
        return '请在群聊中使用此命令';
      }

      if (!adminUser) {
        return '❌ 请@要弹劾的管理员\n💡 使用格式: 发起弹劾 @管理员';
      }

      return await initiateImpeachment(session.guildId, session.userId, adminUser);
    });

  // 计算弹劾所需票数
  async function calculateRequiredImpeachmentVotes(ctx: Context, guildId: string): Promise<number> {
    try {
      // 获取群成员数量
      const bot = ctx.bots.find(bot => bot.platform === 'onebot');
      if (!bot) return 10; // 默认值
      
      try {
        // 首先尝试使用 getGroupMemberList 获取成员列表（更准确）
        try {
          const memberList = await bot.internal.getGroupMemberList(guildId);
          if (memberList && memberList.length > 0) {
            const memberCount = memberList.length;
            // 计算所需票数：群成员数的10%，最少5票，最多20票
            const requiredVotes = Math.max(5, Math.min(20, Math.ceil(memberCount * 0.1)));
            logger.info(`群 ${guildId} 成员数(通过成员列表): ${memberCount}, 弹劾所需票数: ${requiredVotes}`);
            return requiredVotes;
          }
        } catch (memberListError) {
          logger.warn(`通过成员列表获取群 ${guildId} 成员数失败:`, memberListError);
        }
        
        // 如果成员列表获取失败，尝试使用 getGroupInfo
        const groupInfo = await bot.internal.getGroupInfo(guildId);
        let memberCount = groupInfo?.memberCount || 0;
        
        // 如果获取到的成员数为0，使用默认值50
        if (memberCount === 0) {
          logger.warn(`群 ${guildId} 成员数获取为0，使用默认值50`);
          memberCount = 50;
        }
        
        // 计算所需票数：群成员数的10%，最少5票，最多20票
        const requiredVotes = Math.max(5, Math.min(20, Math.ceil(memberCount * 0.1)));
        logger.info(`群 ${guildId} 成员数(通过群信息): ${memberCount}, 弹劾所需票数: ${requiredVotes}`);
        return requiredVotes;
      } catch (error) {
        logger.error(`获取群 ${guildId} 成员数失败:`, error);
        return 10; // 默认值
      }
    } catch (error) {
      logger.error(`计算弹劾所需票数失败:`, error);
      return 10; // 默认值
    }
  }

  // 发起弹劾投票的逻辑
  async function initiateImpeachment(guildId: string, initiatorId: string, adminUserId: string): Promise<string> {
    // 统一用户ID格式，去除平台前缀
    adminUserId = adminUserId.includes(':') ? adminUserId.split(':').pop() : adminUserId;
    try {
      // 检查发起人是否有档案
      const initiatorProfile = await ctx.database.get('FileSystem', {
        userId: initiatorId,
        groupId: guildId
      });

      if (initiatorProfile.length === 0) {
        return '❌ 请先填写个人档案才能发起弹劾\n💡 使用 "申请档案" 命令填写档案';
      }

      // 检查被弹劾的用户是否是管理员
      const admin = await ctx.database.get('Administrator', {
        userId: adminUserId,
        guildId: guildId,
        isActive: true
      });

      if (admin.length === 0) {
        logger.info(`用户 ${adminUserId} 未在Administrator表中找到，检查实际群管理员权限`);
        
        try {
          logger.info(`开始检查用户 ${adminUserId} 在群 ${guildId} 的管理员权限`);
          const adminList = await getGroupAdminList(ctx, guildId);
          logger.info(`获取到的管理员列表: ${JSON.stringify(adminList)}`);
          
          // 处理用户ID，移除平台前缀（如 onebot:123456 -> 123456）
          const cleanAdminUserId = adminUserId.includes(':') ? adminUserId.split(':').pop() : adminUserId;
          logger.info(`清理后的用户ID: ${cleanAdminUserId}`);
          
          const isActualAdmin = adminList.includes(cleanAdminUserId);
          logger.info(`用户 ${cleanAdminUserId} 是否在管理员列表中: ${isActualAdmin}`);
          
          if (!isActualAdmin) {
            return `❌ 该用户不是当前管理员\n调试信息: 用户ID ${cleanAdminUserId} 不在管理员列表 [${adminList.join(', ')}] 中`;
          }
          
          logger.info(`用户 ${adminUserId} 是实际管理员但未在系统中注册，允许弹劾但建议同步`);
          // 如果是实际管理员但未注册，仍然允许弹劾，但给出提示
          // 不直接返回错误，而是继续弹劾流程，但跳过任期检查
        } catch (error) {
          logger.error(`检查用户 ${adminUserId} 管理员权限时出错:`, error);
          return '❌ 检查管理员权限时出错，请稍后重试';
        }
      }

      let administrator = null;
      let appointmentTime = null;
      let daysSinceAppointment = 0;
      let adminName = '未知管理员';
      let isUnregisteredAdmin = false;

      if (admin.length > 0) {
        administrator = admin[0];
        appointmentTime = new Date(administrator.appointmentTime);
        daysSinceAppointment = Math.floor((new Date().getTime() - appointmentTime.getTime()) / (1000 * 60 * 60 * 24));
        
        // 检查管理员任期（仅对已注册的管理员）
        if (daysSinceAppointment < 3) {
          return `❌ 该管理员任职时间不足3天，暂不能发起弹劾\n📅 任职时间: ${appointmentTime.toLocaleDateString('zh-CN')} (${daysSinceAppointment}天)`;
        }
      } else {
        // 未注册的管理员，跳过任期检查
        isUnregisteredAdmin = true;
        logger.info(`用户 ${adminUserId} 是未注册的管理员，跳过任期检查`);
      }

      // 检查是否已有进行中的弹劾投票
      const ongoingImpeachment = await ctx.database.get('ImpeachmentRecord', {
        adminUserId: adminUserId,
        guildId: guildId,
        status: 'ongoing'
      });

      if (ongoingImpeachment.length > 0) {
        return '❌ 该管理员已有进行中的弹劾投票\n💡 使用 "弹劾投票统计" 查看投票情况';
      }

      // 检查弹劾冷却期（最近7天内是否有失败的弹劾）
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentFailedImpeachment = await ctx.database.get('ImpeachmentRecord', {
        adminUserId: adminUserId,
        guildId: guildId,
        status: 'failed'
      });

      const recentFailed = recentFailedImpeachment.filter(record => 
        new Date(record.endTime!) > sevenDaysAgo
      );

      if (recentFailed.length > 0) {
        const lastFailedTime = new Date(Math.max(...recentFailed.map(r => new Date(r.endTime!).getTime())));
        const cooldownEnd = new Date(lastFailedTime.getTime() + 7 * 24 * 60 * 60 * 1000);
        return `❌ 弹劾冷却期中，请等待至 ${cooldownEnd.toLocaleString('zh-CN')} 后再发起\n💡 这是为了防止恶意频繁弹劾`;
      }

      // 检查发起人是否频繁发起弹劾（30天内不能超过2次）
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const initiatorRecentImpeachments = await ctx.database.get('ImpeachmentRecord', {
        initiatorId: initiatorId,
        guildId: guildId
      });

      const recentInitiated = initiatorRecentImpeachments.filter(record => 
        new Date(record.initiateTime) > thirtyDaysAgo
      );

      if (recentInitiated.length >= 2) {
        return '❌ 您在30天内已发起过2次弹劾，请等待冷却期结束\n💡 这是为了防止滥用弹劾机制';
      }

      const now = new Date();

      // 获取管理员和发起人信息
      const adminProfile = await ctx.database.get('FileSystem', {
        userId: adminUserId,
        groupId: guildId
      });

      adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
      const initiatorName = initiatorProfile[0].realname;

      // 计算所需票数
      const requiredVotes = await calculateRequiredImpeachmentVotes(ctx, guildId);

      // 创建弹劾记录
      const impeachmentRecord = await ctx.database.create('ImpeachmentRecord', {
        adminUserId: adminUserId,
        guildId: guildId,
        initiatorId: initiatorId,
        initiateTime: now,
        status: 'ongoing',
        supportVotes: 0,
        opposeVotes: 0,
        totalVotes: 0,
        requiredVotes: requiredVotes,
        reason: `由 ${initiatorName} 发起的弹劾投票`
      });

      // 发送弹劾投票通知
      const bot = ctx.bots.find(bot => bot.platform === 'onebot');
      if (bot) {
        let message = `⚖️ 弹劾投票发起！\n\n` +
          `👤 被弹劾管理员: ${adminName}`;
        
        if (!isUnregisteredAdmin && administrator) {
          message += ` (${administrator.classNumber})\n🙋 发起人: ${initiatorName}\n` +
            `📅 管理员任职时间: ${appointmentTime.toLocaleDateString('zh-CN')}\n⏰ 任期: ${daysSinceAppointment}天\n`;
        } else {
          message += `\n🙋 发起人: ${initiatorName}\n` +
            `⚠️ 注意: 该管理员未在系统中注册\n💡 建议使用 \"同步管理员权限\" 命令同步管理员信息\n`;
        }
        
        message += `🆔 弹劾编号: #${impeachmentRecord.id}\n\n` +
          `📊 弹劾投票规则:\n• 需要至少${requiredVotes}票才能生效\n• 反对票数 > 支持票数 = 弹劾失败，管理员留任\n` +
          `• 支持票数 ≥ 反对票数 = 弹劾成功，管理员卸任\n• 只有已填写档案的成员可以投票\n• 每人只能投票一次\n\n` +
          `💡 使用 "支持连任 @${adminName}" 支持管理员留任\n💡 使用 "反对连任 @${adminName}" 支持弹劾管理员\n` +
          `💡 使用 "弹劾投票统计" 查看投票情况\n\n⚠️ 请理性投票，弹劾需要充分理由`;

        await bot.sendMessage(guildId, message);
      }

      logger.info(`用户 ${initiatorId} (${initiatorName}) 发起对管理员 ${adminUserId} (${adminName}) 的弹劾投票，记录ID: ${impeachmentRecord.id}`);
      
      // 设置定时检查弹劾结果
      const checkKey = `impeachment-check-${adminUserId}-${guildId}`;
      const checkDispose = ctx.cron(`0 0 10 * * *`, async () => {
        await checkImpeachmentResult(guildId, adminUserId);
      });
      registeredJobs.set(checkKey, checkDispose);

      let resultMessage = `✅ 弹劾投票已发起！\n\n👤 被弹劾管理员: ${adminName}\n🙋 发起人: ${initiatorName}\n⏰ 发起时间: ${now.toLocaleString('zh-CN')}\n🆔 弹劾编号: #${impeachmentRecord.id}`;
      
      if (isUnregisteredAdmin) {
        resultMessage += `\n\n⚠️ 注意: 该管理员未在系统中注册，建议先同步管理员权限`;
      }
      
      resultMessage += `\n\n💡 群内已发布弹劾投票通知，请等待群员投票`;
      
      return resultMessage;

    } catch (error) {
      logger.error('发起弹劾投票失败:', error);
      return '❌ 发起弹劾投票失败，请稍后重试';
    }
  }

  // 取消弹劾命令 - 请手动添加到 RegularPowerTransfer.ts 文件中

ctx.command('取消弹劾 <adminUser:user>')
  .usage('取消对管理员的弹劾投票\n只有发起人可以取消')
  .action(async ({ session }, adminUser) => {
    if (!session?.guildId || !session?.userId) {
      return '❌ 此命令只能在群聊中使用';
    }

    const { guildId, userId: initiatorId } = session;
    const adminUserId = adminUser.includes(':') ? adminUser.split(':').pop() : adminUser;

    try {
      // 查找进行中的弹劾记录
      const impeachmentRecords = await ctx.database.get('ImpeachmentRecord', {
        adminUserId: adminUserId,
        guildId: guildId,
        status: 'ongoing'
      });

      if (impeachmentRecords.length === 0) {
        return '❌ 没有找到对该管理员的进行中弹劾投票';
      }

      const impeachmentRecord = impeachmentRecords[0];

      // 检查是否是发起人
      if (impeachmentRecord.initiatorId !== initiatorId) {
        return '❌ 只有弹劾发起人可以取消弹劾投票';
      }

      // 获取管理员信息用于显示
      const adminProfile = await ctx.database.get('FileSystem', {
        userId: adminUserId,
        groupId: guildId
      });
      const adminInfo = await ctx.database.get('Administrator', {
        userId: adminUserId,
        guildId: guildId
      });
      const adminName = adminProfile.length > 0 ? adminProfile[0].realname : adminUserId

      // 获取发起人信息
      const initiatorProfile = await ctx.database.get('FileSystem', {
        userId: initiatorId,
        groupId: guildId
      });
      const initiatorName = initiatorProfile.length > 0 ? initiatorProfile[0].realname : '未知用户';

      // 获取当前投票统计
      const votes = await ctx.database.get('ReelectionVote', {
        adminUserId: adminUserId,
        guildId: guildId
      });
      const supportVotes = votes.filter(v => v.isSupport).length;
      const opposeVotes = votes.filter(v => !v.isSupport).length;

      // 更新弹劾记录状态为已取消
      await ctx.database.set('ImpeachmentRecord', impeachmentRecord.id, {
        status: 'cancelled',
        endTime: new Date()
      });

      // 删除相关投票记录
      await ctx.database.remove('ReelectionVote', {
        adminUserId: adminUserId,
        guildId: guildId
      });

      // 清理定时任务
      const checkKey = `impeachment-check-${adminUserId}-${guildId}`;
      const dispose = registeredJobs.get(checkKey);
      if (dispose) {
        dispose();
        registeredJobs.delete(checkKey);
      }

      // 发送取消通知
      const bot = ctx.bots.find(bot => bot.platform === 'onebot');
      if (bot) {
        const message = `⏹️ 弹劾投票已取消\n\n` +
          `👤 被弹劾管理员: ${adminName}\n` +
          `🙋 发起人: ${initiatorName}\n` +
          `🆔 弹劾编号: #${impeachmentRecord.id}\n` +
          `⏰ 取消时间: ${new Date().toLocaleString('zh-CN')}\n\n` +
          `📊 取消时投票统计:\n` +
          `✅ 支持: ${supportVotes}票\n` +
          `❌ 反对: ${opposeVotes}票\n\n` +
          `💡 弹劾投票已被发起人取消`;
        
        await bot.sendMessage(guildId, message);
      }

      logger.info(`用户 ${initiatorId} (${initiatorName}) 取消了对管理员 ${adminUserId} (${adminName}) 的弹劾投票，记录ID: ${impeachmentRecord.id}`);
      
      return `✅ 弹劾投票已成功取消\n\n` +
        `👤 被弹劾管理员: ${adminName}\n` +
        `🆔 弹劾编号: #${impeachmentRecord.id}\n` +
        `💡 群内已发布取消通知`;

    } catch (error) {
      logger.error('取消弹劾投票失败:', error);
      return '❌ 取消弹劾投票失败，请稍后重试';
    }
  });

  // 检查弹劾结果
  async function checkImpeachmentResult(guildId: string, adminUserId: string) {
    try {
      // 获取弹劾记录
      const impeachmentRecords = await ctx.database.get('ImpeachmentRecord', {
        adminUserId: adminUserId,
        guildId: guildId,
        status: 'ongoing'
      });

      if (impeachmentRecords.length === 0) {
        logger.warn(`未找到管理员 ${adminUserId} 的进行中弹劾记录`);
        return;
      }

      const impeachmentRecord = impeachmentRecords[0];

      const votes = await ctx.database.get('ReelectionVote', {
        adminUserId: adminUserId,
        guildId: guildId
      });

      const supportVotes = votes.filter(v => v.isSupport).length;
      const opposeVotes = votes.filter(v => !v.isSupport).length;
      const totalVotes = votes.length;

      const adminProfile = await ctx.database.get('FileSystem', {
        userId: adminUserId,
        groupId: guildId
      });
      const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';

      const now = new Date();

      // 获取弹劾记录中的所需票数
      const requiredVotes = impeachmentRecord.requiredVotes || 10;
      
      if (totalVotes >= requiredVotes) {
        if (opposeVotes >= supportVotes) {
          // 弹劾成功
          await executeAdminRemoval(guildId, adminUserId, adminName, supportVotes, opposeVotes, totalVotes, true);
          
          // 更新弹劾记录
          await ctx.database.set('ImpeachmentRecord', impeachmentRecord.id, {
            endTime: now,
            status: 'success',
            supportVotes: supportVotes,
            opposeVotes: opposeVotes,
            totalVotes: totalVotes,
            result: `弹劾成功：支持弹劾 ${opposeVotes} 票，支持留任 ${supportVotes} 票`
          });
        } else {
          // 弹劾失败
          logger.info(`管理员 ${adminUserId} (${adminName}) 弹劾失败，继续留任`);
          
          const bot = ctx.bots.find(bot => bot.platform === 'onebot');
          if (bot) {
            const message = `⚖️ 弹劾投票结果公布\n\n👤 管理员: ${adminName}\n✅ 支持留任: ${supportVotes}票\n❌ 支持弹劾: ${opposeVotes}票\n📊 总票数: ${totalVotes}票\n🆔 弹劾编号: #${impeachmentRecord.id}\n\n🎊 结果: 弹劾失败，管理员继续留任\n💡 感谢大家的理性投票`;
            await bot.sendMessage(guildId, message);
          }
          
          // 更新弹劾记录
          await ctx.database.set('ImpeachmentRecord', impeachmentRecord.id, {
            endTime: now,
            status: 'failed',
            supportVotes: supportVotes,
            opposeVotes: opposeVotes,
            totalVotes: totalVotes,
            result: `弹劾失败：支持留任 ${supportVotes} 票，支持弹劾 ${opposeVotes} 票`
          });
          
          await ctx.database.remove('ReelectionVote', {
            adminUserId: adminUserId,
            guildId: guildId
          });
        }
      } else if (totalVotes > 0) {
        // 获取弹劾记录中的所需票数
        const requiredVotes = impeachmentRecord.requiredVotes || 10;
        logger.info(`管理员 ${adminUserId} (${adminName}) 弹劾投票票数不足 (${totalVotes}/${requiredVotes})，继续等待`);
        
        // 更新弹劾记录的当前投票数
        await ctx.database.set('ImpeachmentRecord', impeachmentRecord.id, {
          supportVotes: supportVotes,
          opposeVotes: opposeVotes,
          totalVotes: totalVotes
        });
      }

    } catch (error) {
      logger.error(`检查管理员 ${adminUserId} 弹劾结果失败:`, error);
    }
  }

  // 查看当前投票状态命令
  ctx.command('投票状态', { authority: 3 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        const votes = await ctx.database.get('ReelectionVote', {
          guildId: session.guildId
        });

        if (votes.length === 0) {
          return '📊 当前没有进行中的投票';
        }

        // 按管理员分组统计投票
        const votesByAdmin = new Map<string, { support: number; oppose: number; adminName: string }>();
        
        for (const vote of votes) {
          if (!votesByAdmin.has(vote.adminUserId)) {
            const adminProfile = await ctx.database.get('FileSystem', {
              userId: vote.adminUserId,
              groupId: session.guildId
            });
            const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
            
            votesByAdmin.set(vote.adminUserId, { support: 0, oppose: 0, adminName });
          }
          
          const adminVotes = votesByAdmin.get(vote.adminUserId)!;
          if (vote.isSupport) {
            adminVotes.support++;
          } else {
            adminVotes.oppose++;
          }
        }

        let message = `📊 当前投票状态\n\n`;
        
        for (const [adminId, stats] of votesByAdmin) {
          const total = stats.support + stats.oppose;
          message += `👤 ${stats.adminName}\n`;
          message += `  ✅ 支持: ${stats.support}票\n`;
          message += `  ❌ 反对: ${stats.oppose}票\n`;
          message += `  📊 总计: ${total}票\n\n`;
        }

        message += `💡 使用 "支持连任 @管理员" 或 "反对连任 @管理员" 参与投票`;

        return message;

      } catch (error) {
        logger.error('查看投票状态失败:', error);
        return '❌ 查看投票状态失败';
      }
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
        return '❌ 发起选举失败';
      }
    });

  // 查看选举状态命令
  ctx.command('选举状态', { authority: 3 })
    .action(async ({ session }) => {
      if (!session?.guildId) return '请在群聊中使用此命令';
      
      try {
        const elections = await ctx.database.get('Election', { guildId: session.guildId });
        const ongoingElections = elections.filter(e => 
          e.status === 'preparation' || e.status === 'candidate_registration' || e.status === 'voting'
        );

        if (ongoingElections.length === 0) {
          return '📊 当前没有进行中的选举';
        }

        let message = '📊 当前选举状态:\n\n';
        for (const election of ongoingElections) {
          message += `🗳️ 选举ID: ${election.electionId}\n`;
          message += `📋 类型: ${election.electionType === 'initial' ? '初选' : '连任选举'}\n`;
          message += `📊 状态: ${election.status}\n`;
          message += `⏰ 开始时间: ${new Date(election.startTime).toLocaleString('zh-CN')}\n`;
          if (election.candidateRegistrationEndTime) {
            message += `📝 报名截止: ${new Date(election.candidateRegistrationEndTime).toLocaleString('zh-CN')}\n`;
          }
          if (election.votingEndTime) {
            message += `🗳️ 投票截止: ${new Date(election.votingEndTime).toLocaleString('zh-CN')}\n`;
          }
          message += '\n';
        }

        return message;
      } catch (error) {
        logger.error('查看选举状态失败:', error);
        return '❌ 查看选举状态失败';
      }
    });

  // 弹劾历史查询命令
  ctx.command('弹劾历史 [用户]', { authority: 3 })
    .action(async ({ session }, user) => {
      if (!session?.guildId) return '请在群聊中使用此命令';
      
      try {
        let targetUserId: string | undefined;
        
        if (user) {
          // 解析@用户
          const atMatch = user.match(/<at id="(\d+)"\/>/);
          if (atMatch) {
            targetUserId = atMatch[1];
          }
        }
        
        let impeachmentRecords;
        if (targetUserId) {
          // 查询特定用户的弹劾历史
          impeachmentRecords = await ctx.database.get('ImpeachmentRecord', {
            adminUserId: targetUserId,
            guildId: session.guildId
          });
        } else {
          // 查询所有弹劾历史
          impeachmentRecords = await ctx.database.get('ImpeachmentRecord', {
            guildId: session.guildId
          });
        }
        
        if (impeachmentRecords.length === 0) {
          return targetUserId ? '📊 该用户没有弹劾历史记录' : '📊 本群没有弹劾历史记录';
        }
        
        // 按时间倒序排列
        impeachmentRecords.sort((a, b) => new Date(b.initiateTime).getTime() - new Date(a.initiateTime).getTime());
        
        let message = targetUserId ? '📊 弹劾历史记录:\n\n' : '📊 群内弹劾历史记录:\n\n';
        
        for (const record of impeachmentRecords.slice(0, 10)) { // 最多显示10条
          // 获取管理员和发起人信息
          const adminProfile = await ctx.database.get('FileSystem', {
            userId: record.adminUserId,
            groupId: session.guildId
          });
          const initiatorProfile = await ctx.database.get('FileSystem', {
            userId: record.initiatorId,
            groupId: session.guildId
          });
          
          const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
          const initiatorName = initiatorProfile.length > 0 ? initiatorProfile[0].realname : '未知用户';
          
          const statusEmoji = {
            'ongoing': '🔄',
            'success': '✅',
            'failed': '❌',
            'cancelled': '⏹️'
          };
          
          const statusText = {
            'ongoing': '进行中',
            'success': '弹劾成功',
            'failed': '弹劾失败',
            'cancelled': '已取消'
          };
          
          message += `${statusEmoji[record.status]} 弹劾编号: #${record.id}\n`;
          message += `👤 被弹劾管理员: ${adminName}\n`;
          message += `🙋 发起人: ${initiatorName}\n`;
          message += `📅 发起时间: ${new Date(record.initiateTime).toLocaleString('zh-CN')}\n`;
          if (record.endTime) {
            message += `⏰ 结束时间: ${new Date(record.endTime).toLocaleString('zh-CN')}\n`;
          }
          message += `📊 状态: ${statusText[record.status]}\n`;
          if (record.totalVotes > 0) {
            message += `🗳️ 投票结果: 支持留任 ${record.supportVotes} 票，支持弹劾 ${record.opposeVotes} 票\n`;
          }
          if (record.result) {
            message += `📝 结果: ${record.result}\n`;
          }
          message += '\n';
        }
        
        if (impeachmentRecords.length > 10) {
          message += `💡 共有 ${impeachmentRecords.length} 条记录，仅显示最近10条`;
        }
        
        return message;
        
      } catch (error) {
        logger.error('查询弹劾历史失败:', error);
        return '❌ 查询弹劾历史失败';
      }
    });

  // 弹劾投票统计命令
  ctx.command('弹劾投票统计', { authority: 3 })
    .action(async ({ session }) => {
      if (!session?.guildId) return '请在群聊中使用此命令';
      
      try {
        const ongoingImpeachments = await ctx.database.get('ImpeachmentRecord', {
          guildId: session.guildId,
          status: 'ongoing'
        });
        
        if (ongoingImpeachments.length === 0) {
          return '📊 当前没有进行中的弹劾投票';
        }
        
        let message = '📊 当前弹劾投票统计:\n\n';
        
        for (const impeachment of ongoingImpeachments) {
          const votes = await ctx.database.get('ReelectionVote', {
            adminUserId: impeachment.adminUserId,
            guildId: session.guildId
          });
          
          const supportVotes = votes.filter(v => v.isSupport).length;
          const opposeVotes = votes.filter(v => !v.isSupport).length;
          const totalVotes = votes.length;
          
          const adminProfile = await ctx.database.get('FileSystem', {
            userId: impeachment.adminUserId,
            groupId: session.guildId
          });
          const initiatorProfile = await ctx.database.get('FileSystem', {
            userId: impeachment.initiatorId,
            groupId: session.guildId
          });
          
          const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
          const initiatorName = initiatorProfile.length > 0 ? initiatorProfile[0].realname : '未知用户';
          
          message += `⚖️ 弹劾编号: #${impeachment.id}\n`;
          message += `👤 被弹劾管理员: ${adminName}\n`;
          message += `🙋 发起人: ${initiatorName}\n`;
          message += `📅 发起时间: ${new Date(impeachment.initiateTime).toLocaleString('zh-CN')}\n`;
          message += `✅ 支持留任: ${supportVotes} 票\n`;
          message += `❌ 支持弹劾: ${opposeVotes} 票\n`;
          // 获取弹劾记录中的所需票数
          const requiredVotes = impeachment.requiredVotes || 10;
          message += `📊 总票数: ${totalVotes} 票 (需要至少${requiredVotes}票生效)\n`;
          
          if (totalVotes >= requiredVotes) {
            if (opposeVotes >= supportVotes) {
              message += `🎯 当前趋势: 弹劾成功\n`;
            } else {
              message += `🎯 当前趋势: 弹劾失败，管理员留任\n`;
            }
          } else {
            message += `⏳ 票数不足，还需 ${requiredVotes - totalVotes} 票\n`;
          }
          message += '\n';
        }
        
        return message;
        
      } catch (error) {
        logger.error('查询弹劾投票统计失败:', error);
        return '❌ 查询弹劾投票统计失败';
      }
    });

  // 调试命令：检查群管理员列表
  ctx.command('检查群管理员 [targetUser:user]', { authority: 4 })
    .action(async ({ session }, targetUser) => {
      if (!session?.guildId) return '请在群聊中使用此命令'
      
      try {
        // 获取实际的群管理员列表
        const adminList = await getGroupAdminList(ctx, session.guildId)
        
        let message = `📋 群 ${session.guildId} 的管理员列表:\n\n`
        
        if (adminList.length === 0) {
          message += '❌ 未找到任何管理员'
        } else {
          for (let i = 0; i < adminList.length; i++) {
            const adminId = adminList[i]
            message += `${i + 1}. ${adminId}\n`
          }
        }
        
        // 如果指定了目标用户，检查该用户是否在列表中
        if (targetUser) {
          let targetUserId: string | null = null
          if (typeof targetUser === 'string') {
            const parts = targetUser.split(':')
            targetUserId = parts[parts.length - 1]
          }
          
          if (targetUserId) {
            const isAdmin = adminList.includes(targetUserId)
            message += `\n🔍 用户 ${targetUserId} 是否为管理员: ${isAdmin ? '✅ 是' : '❌ 否'}`
          }
        }
        
        return message
        
      } catch (error) {
        logger.error('检查群管理员列表失败:', error)
        return '❌ 检查群管理员列表失败: ' + error.message
      }
    })

  // 连任系统状态命令
  ctx.command('连任系统状态', { authority: 3 })
    .usage('查看当前连任系统状态，包括管理员任期和投票情况')
    .action(async ({ session }) => {
      if (!session?.guildId) return '请在群聊中使用此命令';
      
      try {
        const guildId = session.guildId;
        
        // 获取所有活跃管理员
        const activeAdmins = await ctx.database.get('Administrator', {
          guildId,
          isActive: true
        });
        
        if (activeAdmins.length === 0) {
          return '📊 当前群组没有活跃管理员';
        }
        
        let message = '📊 连任系统状态\n\n';
        message += `👥 当前管理员数量: ${activeAdmins.length}/8\n\n`;
        
        // 按任期排序
        activeAdmins.sort((a, b) => new Date(a.appointmentTime).getTime() - new Date(b.appointmentTime).getTime());
        
        for (const admin of activeAdmins) {
          const appointmentTime = new Date(admin.appointmentTime);
          const now = new Date();
          const daysSinceAppointment = Math.floor((now.getTime() - appointmentTime.getTime()) / (1000 * 60 * 60 * 24));
          
          // 获取管理员信息
          const adminProfile = await ctx.database.get('FileSystem', {
            userId: admin.userId,
            groupId: guildId
          });
          const adminName = adminProfile.length > 0 ? adminProfile[0].realname : admin.userId;
          
          // 获取连任投票情况
          const votes = await ctx.database.get('ReelectionVote', {
            adminUserId: admin.userId,
            guildId: guildId
          });
          
          const supportVotes = votes.filter(v => v.isSupport).length;
          const opposeVotes = votes.filter(v => !v.isSupport).length;
          
          message += `👤 ${adminName} (${admin.classNumber || '未知班级'})\n`;
          message += `📅 任职时间: ${appointmentTime.toLocaleDateString('zh-CN')}\n`;
          message += `⏰ 任期: ${daysSinceAppointment}天\n`;
          
          if (votes.length > 0) {
            message += `🗳️ 连任投票: ✅${supportVotes} ❌${opposeVotes}\n`;
          }
          
          // 检查是否有进行中的弹劾
          const impeachments = await ctx.database.get('ImpeachmentRecord', {
            adminUserId: admin.userId,
            guildId: guildId,
            status: 'ongoing'
          });
          
          if (impeachments.length > 0) {
            message += `⚠️ 状态: 正在被弹劾 (ID: #${impeachments[0].id})\n`;
          } else if (daysSinceAppointment >= 7) {
            message += `⚠️ 状态: 需要连任投票\n`;
          } else {
            message += `✅ 状态: 正常\n`;
          }
          
          message += '\n';
        }
        
        return message;
        
      } catch (error) {
        logger.error('查询连任系统状态失败:', error);
        return '❌ 查询连任系统状态失败';
      }
    });

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
}