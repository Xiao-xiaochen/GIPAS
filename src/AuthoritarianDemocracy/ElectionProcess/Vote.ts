import { Context } from 'koishi';
import { Config } from '../../config';
import { setGroupAdmin, batchSetGroupAdmin } from '../../Utils/GroupAdminManagement';

export function VotingSystem(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:voting');

  // 投票命令 - 群内公开投票
  ctx.command('投票 <candidateCode:string>')
    .action(async ({ session }, candidateCode) => {
      if (!session?.guildId || !session?.userId) {
        return '请在群聊中使用此命令';
      }

      return await processVote(session.guildId, session.userId, candidateCode, true);
    });

  // 私密投票命令 - 私聊投票
  ctx.command('私密投票 <candidateCode:string>')
    .action(async ({ session }, candidateCode) => {
      if (!session?.userId) {
        return '请提供有效的用户信息';
      }

      // 需要指定群组ID，这里可以通过其他方式获取或要求用户提供
      // 暂时使用配置中的第一个启用群组
      const guildId = config.enabledGroups[0];
      if (!guildId) {
        return '❌ 未配置启用的群组';
      }

      return await processVote(guildId, session.userId, candidateCode, false);
    });

  // 处理投票逻辑
  async function processVote(guildId: string, voterId: string, candidateCode: string, isPublic: boolean): Promise<string> {
    try {
      if (!candidateCode) {
        return '❌ 请提供候选人编号\n💡 使用格式: 投票 101 (公开投票) 或 私密投票 101';
      }

      // 检查是否有进行中的投票
      const allElections = await ctx.database.get('Election', { guildId });
      const ongoingElection = allElections.filter(e => e.status === 'voting');

      if (ongoingElection.length === 0) {
        return '❌ 当前没有进行中的投票\n💡 使用 "选举状态" 查看选举进度';
      }

      const election = ongoingElection[0];

      // 检查投票是否已截止
      if (election.votingEndTime && new Date() > new Date(election.votingEndTime)) {
        return '❌ 投票已截止';
      }

      // 检查候选人是否存在
      const candidate = await ctx.database.get('ElectionCandidate', {
        electionId: election.electionId,
        candidateCode: candidateCode,
        isApproved: true
      });

      if (candidate.length === 0) {
        return `❌ 候选人编号 ${candidateCode} 不存在\n💡 使用 "候选人列表" 查看所有候选人`;
      }

      // 检查投票者是否为候选人
      const voterAsCandidate = await ctx.database.get('ElectionCandidate', {
        electionId: election.electionId,
        userId: voterId,
        isApproved: true
      });

      if (voterAsCandidate.length > 0) {
        return '❌ 候选人不得参与投票';
      }

      // 检查是否已经投过票
      const existingVote = await ctx.database.get('ElectionVote', {
        electionId: election.electionId,
        voterId: voterId
      });

      if (existingVote.length > 0) {
        return '❌ 您已经投过票了\n💡 每人只能投一票';
      }

      // 检查投票者是否有档案
      const voterProfile = await ctx.database.get('FileSystem', {
        userId: voterId,
        groupId: guildId
      });

      if (voterProfile.length === 0) {
        return '❌ 请先填写个人档案才能参与投票\n💡 使用 "申请档案" 命令填写档案';
      }

      // 记录投票
      await ctx.database.create('ElectionVote', {
        electionId: election.electionId,
        voterId: voterId,
        guildId: guildId,
        candidateCode: candidateCode,
        voteTime: new Date(),
        isPublic: isPublic
      });

      // 获取候选人信息
      const candidateProfile = await ctx.database.get('FileSystem', {
        userId: candidate[0].userId,
        groupId: guildId
      });

      const candidateName = candidateProfile.length > 0 ? candidateProfile[0].realname : '未知';
      const candidateClass = candidate[0].classNumber;

      let message = `✅ 投票成功！\n\n`;
      message += `🗳️ 您投给了: ${candidateCode} - ${candidateName} (${candidateClass})\n`;
      message += `📊 投票方式: ${isPublic ? '公开投票' : '私密投票'}\n`;
      message += `⏰ 投票时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
      message += `💡 投票已记录，无法修改`;

      // 如果是公开投票，在群内通知
      if (isPublic) {
        const bot = ctx.bots.find(bot => bot.platform === 'onebot');
        if (bot) {
          const voterName = voterProfile[0].realname;
          const publicMessage = `🗳️ ${voterName} 投票给了 ${candidateCode} - ${candidateName} (${candidateClass})`;
          await bot.sendMessage(guildId, publicMessage);
        }
      }

      logger.info(`用户 ${voterId} 投票给候选人 ${candidateCode} (${isPublic ? '公开' : '私密'})`);
      return message;

    } catch (error) {
      logger.error('投票失败:', error);
      return '❌ 投票失败，请稍后重试';
    }
  }

  // 查看投票统计命令
  ctx.command('投票统计')
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        // 获取当前选举 - 优先显示进行中的投票
        const allElections = await ctx.database.get('Election', { guildId: session.guildId });
        
        // 首先查找进行中的投票
        let ongoingElection = allElections.filter(e => e.status === 'voting');
        
        // 如果没有进行中的投票，再查找已完成的选举
        if (ongoingElection.length === 0) {
          ongoingElection = allElections.filter(e => e.status === 'completed');
        }

        if (ongoingElection.length === 0) {
          return '📊 当前没有可查看的选举统计';
        }

        // 如果有多个相同状态的选举，选择最新的一个
        const election = ongoingElection.sort((a, b) => 
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
        )[0];
        
        logger.info(`查看投票统计 - 选举状态: ${election.status}, 选举ID: ${election.electionId}`);
        
        // 获取所有投票（使用新的查询确保获取最新数据）
        const votes = await ctx.database.get('ElectionVote', {
          electionId: election.electionId
        });
        
        logger.info(`获取到 ${votes.length} 条投票记录，选举ID: ${election.electionId}`);

        // 获取所有候选人
        const candidates = await ctx.database.get('ElectionCandidate', {
          electionId: election.electionId,
          isApproved: true
        });

        // 统计每个候选人的得票数
        const voteCount = new Map<string, number>();
        const publicVotes = new Map<string, string[]>(); // 存储公开投票的投票者姓名

        for (const candidate of candidates) {
          voteCount.set(candidate.candidateCode, 0);
          publicVotes.set(candidate.candidateCode, []);
        }

        for (const vote of votes) {
          const currentCount = voteCount.get(vote.candidateCode) || 0;
          voteCount.set(vote.candidateCode, currentCount + 1);

          // 如果是公开投票，记录投票者姓名
          if (vote.isPublic) {
            const voterProfile = await ctx.database.get('FileSystem', {
              userId: vote.voterId,
              groupId: session.guildId
            });
            if (voterProfile.length > 0) {
              const voterNames = publicVotes.get(vote.candidateCode) || [];
              voterNames.push(voterProfile[0].realname);
              publicVotes.set(vote.candidateCode, voterNames);
            }
          }
        }

        // 按班级分组统计
        const statsByClass = new Map<string, any[]>();
        
        for (const candidate of candidates) {
          const profile = await ctx.database.get('FileSystem', {
            userId: candidate.userId,
            groupId: session.guildId
          });

          if (profile.length > 0) {
            const classNum = candidate.classNumber;
            if (!statsByClass.has(classNum)) {
              statsByClass.set(classNum, []);
            }

            const candidateVotes = voteCount.get(candidate.candidateCode) || 0;
            const publicVoterNames = publicVotes.get(candidate.candidateCode) || [];

            statsByClass.get(classNum)!.push({
              code: candidate.candidateCode,
              name: profile[0].realname,
              votes: candidateVotes,
              publicVoters: publicVoterNames
            });
          }
        }

        let message = `📊 投票统计\n\n`;
        message += `🗳️ 总投票数: ${votes.length}\n`;
        message += `👥 候选人数: ${candidates.length}\n`;
        message += `📅 选举状态: ${election.status === 'completed' ? '已完成' : '进行中'}\n\n`;

        // 按班级显示统计
        const sortedClasses = Array.from(statsByClass.keys()).sort((a, b) => parseInt(a) - parseInt(b));
        
        for (const classNum of sortedClasses) {
          const classCandidates = statsByClass.get(classNum)!;
          message += `🏫 ${classNum}:\n`;
          
          // 按得票数排序
          classCandidates.sort((a, b) => b.votes - a.votes);
          
          for (const candidate of classCandidates) {
            message += `  🔢 ${candidate.code} - ${candidate.name}: ${candidate.votes}票`;
            if (candidate.publicVoters.length > 0) {
              message += ` (公开: ${candidate.publicVoters.join(', ')})`;
            }
            message += '\n';
          }
          message += '\n';
        }

        if (election.votingEndTime) {
          const endTime = new Date(election.votingEndTime);
          const now = new Date();
          if (now < endTime) {
            message += `⏰ 投票截止: ${endTime.toLocaleString('zh-CN')}`;
          } else {
            message += `⏰ 投票已截止`;
          }
        }

        return message;

      } catch (error) {
        logger.error('查看投票统计失败:', error);
        return '❌ 获取投票统计失败';
      }
    });

  // 开始投票阶段命令（管理员使用）
  ctx.command('开始投票', { authority: 4 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        // 获取候选人报名阶段的选举
        const candidateElection = await ctx.database.get('Election', {
          guildId: session.guildId,
          status: 'candidate_registration'
        });

        if (candidateElection.length === 0) {
          return '❌ 没有处于候选人报名阶段的选举';
        }

        const election = candidateElection[0];

        // 检查是否有候选人
        const candidates = await ctx.database.get('ElectionCandidate', {
          electionId: election.electionId,
          isApproved: true
        });

        if (candidates.length === 0) {
          return '❌ 没有候选人报名，无法开始投票';
        }

        // 更新选举状态为投票中
        await ctx.database.set('Election', { id: election.id }, {
          status: 'voting'
        });

        // 发送投票开始通知
        const bot = ctx.bots.find(bot => bot.platform === 'onebot');
        if (bot) {
          let message = `🗳️ 投票阶段开始！\n\n`;
          message += `📋 候选人数: ${candidates.length}人\n`;
          message += `⏰ 投票截止: ${election.votingEndTime ? new Date(election.votingEndTime).toLocaleString('zh-CN') : '未设置'}\n\n`;
          message += `💡 投票方式:\n`;
          message += `• 群内公开投票: 投票 候选人编号\n`;
          message += `• 私聊私密投票: 私密投票 候选人编号\n\n`;
          message += `⚠️ 注意事项:\n`;
          message += `• 每人只能投一票\n`;
          message += `• 候选人不得参与投票\n`;
          message += `• 需要填写档案才能投票\n\n`;
          message += `📋 使用 "候选人列表" 查看所有候选人`;

          await bot.sendMessage(session.guildId, message);
        }

        logger.info(`群组 ${session.guildId} 开始投票阶段`);
        return '✅ 投票阶段已开始';

      } catch (error) {
        logger.error('开始投票失败:', error);
        return '❌ 开始投票失败，请稍后重试';
      }
    });

  // 结束投票并统计结果命令（管理员使用）
  ctx.command('结束投票', { authority: 4 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        const votingElection = await ctx.database.get('Election', {
          guildId: session.guildId,
          status: 'voting'
        });

        if (votingElection.length === 0) {
          return '❌ 没有进行中的投票';
        }

        const election = votingElection[0];

        // 统计选举结果
        const results = await calculateElectionResults(election.electionId, session.guildId);

        // 更新选举状态和结果
        await ctx.database.set('Election', { id: election.id }, {
          status: 'completed',
          results: JSON.stringify(results)
        });

        // 任命获胜者为管理员
        await appointWinners(results, session.guildId);

        // 发送结果通知
        const bot = ctx.bots.find(bot => bot.platform === 'onebot');
        if (bot) {
          let message = `🎉 选举结果公布！\n\n`;
          
          for (const classResult of results.classwiseResults) {
            message += `🏫 ${classResult.classNumber}:\n`;
            if (classResult.winner) {
              message += `  🏆 当选: ${classResult.winner.name} (${classResult.winner.code}) - ${classResult.winner.votes}票\n`;
            } else {
              message += `  ❌ 无人当选 (无候选人或得票为0)\n`;
            }
            message += '\n';
          }

          message += `📊 总投票数: ${results.totalVotes}\n`;
          message += `👑 新任管理员将获得群管理权限`;

          await bot.sendMessage(session.guildId, message);
        }

        logger.info(`群组 ${session.guildId} 选举结束，结果已公布`);
        return '✅ 选举已结束，结果已公布';

      } catch (error) {
        logger.error('结束投票失败:', error);
        return '❌ 结束投票失败，请稍后重试';
      }
    });

  // 计算选举结果
  async function calculateElectionResults(electionId: string, guildId: string) {
    // 获取最新的投票和候选人数据
    const votes = await ctx.database.get('ElectionVote', { electionId });
    const candidates = await ctx.database.get('ElectionCandidate', { 
      electionId, 
      isApproved: true 
    });
    
    logger.info(`计算选举结果: 获取到 ${votes.length} 条投票记录，${candidates.length} 名候选人`);

    // 按班级分组候选人
    const candidatesByClass = new Map<string, any[]>();
    for (const candidate of candidates) {
      const profile = await ctx.database.get('FileSystem', {
        userId: candidate.userId,
        groupId: guildId
      });

      if (profile.length > 0) {
        const classNum = candidate.classNumber;
        if (!candidatesByClass.has(classNum)) {
          candidatesByClass.set(classNum, []);
        }
        candidatesByClass.get(classNum)!.push({
          ...candidate,
          profile: profile[0],
          votes: 0
        });
      }
    }

    // 统计每个候选人的得票数
    for (const vote of votes) {
      for (const [classNum, classCandidates] of candidatesByClass) {
        const candidate = classCandidates.find(c => c.candidateCode === vote.candidateCode);
        if (candidate) {
          candidate.votes++;
        }
      }
    }

    // 确定每个班级的获胜者
    const classwiseResults = [];
    for (const [classNum, classCandidates] of candidatesByClass) {
      classCandidates.sort((a, b) => b.votes - a.votes);
      const winner = classCandidates.length > 0 && classCandidates[0].votes > 0 ? {
        userId: classCandidates[0].userId,
        name: classCandidates[0].profile.realname,
        code: classCandidates[0].candidateCode,
        votes: classCandidates[0].votes
      } : null;

      classwiseResults.push({
        classNumber: classNum,
        candidates: classCandidates.map(c => ({
          userId: c.userId,
          name: c.profile.realname,
          code: c.candidateCode,
          votes: c.votes
        })),
        winner
      });
    }

    return {
      electionId,
      totalVotes: votes.length,
      classwiseResults,
      timestamp: new Date()
    };
  }

  // 任命获胜者为管理员
  async function appointWinners(results: any, guildId: string) {
    const winnersToAppoint = [];
    
    for (const classResult of results.classwiseResults) {
      if (classResult.winner) {
        // 检查是否已经是管理员
        const existingAdmin = await ctx.database.get('Administrator', {
          userId: classResult.winner.userId,
          guildId: guildId,
          isActive: true
        });

        if (existingAdmin.length === 0) {
          // 创建管理员记录
          await ctx.database.create('Administrator', {
            userId: classResult.winner.userId,
            guildId: guildId,
            classNumber: classResult.classNumber,
            appointmentTime: new Date(),
            isActive: true
          });

          winnersToAppoint.push(classResult.winner.userId);
          logger.info(`任命 ${classResult.winner.name} (${classResult.winner.userId}) 为管理员`);
        }
      }
    }

    // 批量设置QQ群管理员权限
    if (winnersToAppoint.length > 0) {
      try {
        const appointmentResults = await batchSetGroupAdmin(ctx, guildId, winnersToAppoint, true);
        
        if (appointmentResults.success.length > 0) {
          logger.info(`成功设置QQ群管理员权限: ${appointmentResults.success.join(', ')}`);
        }
        
        if (appointmentResults.failed.length > 0) {
          logger.warn(`设置QQ群管理员权限失败: ${appointmentResults.failed.join(', ')}`);
        }
      } catch (error) {
        logger.error('批量设置群管理员权限失败:', error);
      }
    }
  }
}