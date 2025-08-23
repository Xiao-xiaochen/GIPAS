import { Context } from 'koishi';
import { Config } from '../../config';

export function CandidateManagement(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:candidate');

  // 参与竞选命令
  ctx.command('参与竞选 [manifesto:text]')
    .action(async ({ session }, manifesto) => {
      if (!session?.guildId || !session?.userId) {
        return '请在群聊中使用此命令';
      }

      try {
        // 检查用户档案
        const userProfile = await ctx.database.get('FileSystem', {
          userId: session.userId,
          groupId: session.guildId
        });

        if (userProfile.length === 0) {
          return '❌ 请先填写个人档案才能参与竞选\n💡 使用 "申请档案" 命令填写档案';
        }

        const profile = userProfile[0];

        // 检查参选条件
        if (profile.supervisionRating < 90) {
          return `❌ 监督性评分不足 (当前: ${profile.supervisionRating}/90)`;
        }

        if (profile.positivityRating < 30) {
          return `❌ 积极性评分不足 (当前: ${profile.positivityRating}/30)`;
        }

        if (!profile.Class) {
          return '❌ 档案中缺少班级信息，请更新档案';
        }

        // 获取当前选举
        const allElections = await ctx.database.get('Election', {
          guildId: session.guildId
        });
        const ongoingElection = allElections.filter(e => 
          e.status === 'candidate_registration' || e.status === 'voting'
        );

        if (ongoingElection.length === 0) {
          return '❌ 当前没有进行中的选举\n💡 使用 "选举状态" 查看选举进度';
        }

        const election = ongoingElection[0];

        if (election.status !== 'candidate_registration') {
          return '❌ 当前不在候选人报名阶段';
        }

        // 检查报名截止时间
        if (election.candidateRegistrationEndTime && new Date() > new Date(election.candidateRegistrationEndTime)) {
          return '❌ 候选人报名已截止';
        }

        // 检查是否已经报名
        const existingCandidate = await ctx.database.get('ElectionCandidate', {
          electionId: election.electionId,
          userId: session.userId
        });

        if (existingCandidate.length > 0) {
          return '❌ 您已经报名参选了\n💡 使用 "撤销参选" 可以取消报名';
        }

        // 标准化班级格式 - 统一为纯数字
        let classNumber = profile.Class.replace(/[^\d]/g, ''); // 移除所有非数字字符
        
        // 处理中文数字转换
        if (!classNumber) {
          // 尝试转换中文数字
          const chineseNumbers = {
            '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
            '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
            '零': '0'
          };
          
          let convertedClass = profile.Class;
          for (const [chinese, number] of Object.entries(chineseNumbers)) {
            convertedClass = convertedClass.replace(new RegExp(chinese, 'g'), number);
          }
          
          classNumber = convertedClass.replace(/[^\d]/g, '');
        }
        
        if (!classNumber) {
          return `❌ 档案中班级格式错误: "${profile.Class}"\n💡 班级应包含数字，如: "3班"、"三班"、"3"`;
        }

        // 生成候选人编号 - 格式：班级数字 + 两位序号 (如: 701, 702, 801, 802)
        const existingClassCandidates = await ctx.database.get('ElectionCandidate', {
          electionId: election.electionId,
          classNumber: classNumber
        });

        const candidateSequence = existingClassCandidates.length + 1;
        const candidateCode = `${classNumber}${candidateSequence.toString().padStart(2, '0')}`;

        // 创建候选人记录
        await ctx.database.create('ElectionCandidate', {
          electionId: election.electionId,
          userId: session.userId,
          guildId: session.guildId,
          candidateCode: candidateCode,
          classNumber: classNumber,
          manifesto: manifesto || '暂无竞选宣言',
          applicationTime: new Date(),
          isApproved: true // 自动批准，也可以设置为需要管理员审核
        });

        let message = `✅ 报名成功！\n\n`;
        message += `🏷️ 候选人编号: ${candidateCode}\n`;
        message += `👤 姓名: ${profile.realname}\n`;
        message += `🏫 班级: ${classNumber}班\n`;
        message += `📊 监督性评分: ${profile.supervisionRating}/100\n`;
        message += `📈 积极性评分: ${profile.positivityRating}/100\n`;
        
        if (manifesto) {
          message += `📝 竞选宣言: ${manifesto}\n`;
        }
        
        message += `\n⏰ 报名时间: ${new Date().toLocaleString('zh-CN')}\n`;
        message += `💡 您的候选人编号是 ${candidateCode}，请记住此编号`;

        // 发送群内通知
        const bot = ctx.bots.find(bot => bot.platform === 'onebot');
        if (bot) {
          const publicMessage = `🎯 新候选人报名！\n\n` +
            `🏷️ 编号: ${candidateCode}\n` +
            `👤 ${profile.realname} (${classNumber}班)\n` +
            (manifesto ? `📝 宣言: ${manifesto}` : '');
          
          await bot.sendMessage(session.guildId, publicMessage);
        }

        logger.info(`用户 ${session.userId} (${profile.realname}) 报名参选，编号: ${candidateCode}`);
        return message;

      } catch (error) {
        logger.error('参与竞选失败:', error);
        return '❌ 报名失败，请稍后重试';
      }
    });

  // 撤销参选命令
  ctx.command('撤销参选')
    .action(async ({ session }) => {
      if (!session?.guildId || !session?.userId) {
        return '请在群聊中使用此命令';
      }

      try {
        // 检查是否有进行中的选举
        const ongoingElection = await ctx.database.get('Election', {
          guildId: session.guildId,
          status: 'candidate_registration'
        });

        if (ongoingElection.length === 0) {
          return '❌ 当前没有进行中的候选人报名阶段';
        }

        const election = ongoingElection[0];

        // 查找候选人记录
        const candidate = await ctx.database.get('ElectionCandidate', {
          electionId: election.electionId,
          userId: session.userId
        });

        if (candidate.length === 0) {
          return '❌ 您没有报名参选';
        }

        // 删除候选人记录
        await ctx.database.remove('ElectionCandidate', {
          id: candidate[0].id
        });

        const userProfile = await ctx.database.get('FileSystem', {
          userId: session.userId,
          groupId: session.guildId
        });

        const userName = userProfile.length > 0 ? userProfile[0].realname : '未知用户';

        // 发送群内通知
        const bot = ctx.bots.find(bot => bot.platform === 'onebot');
        if (bot) {
          const message = `📢 ${userName} (${candidate[0].candidateCode}) 已撤销参选`;
          await bot.sendMessage(session.guildId, message);
        }

        logger.info(`用户 ${session.userId} 撤销参选，编号: ${candidate[0].candidateCode}`);
        return `✅ 已成功撤销参选\n🏷️ 原编号: ${candidate[0].candidateCode}`;

      } catch (error) {
        logger.error('撤销参选失败:', error);
        return '❌ 撤销参选失败，请稍后重试';
      }
    });

  // 查看候选人列表命令
  ctx.command('候选人列表')
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        // 获取当前选举
        const allElections = await ctx.database.get('Election', {
          guildId: session.guildId
        });
        const ongoingElection = allElections.filter(e => 
          e.status === 'candidate_registration' || e.status === 'voting'
        );

        if (ongoingElection.length === 0) {
          return '📋 当前没有进行中的选举';
        }

        const election = ongoingElection[0];

        // 获取所有候选人
        const candidates = await ctx.database.get('ElectionCandidate', {
          electionId: election.electionId,
          isApproved: true
        });

        if (candidates.length === 0) {
          return '📋 暂无候选人报名';
        }

        // 按班级分组
        const candidatesByClass = new Map<string, any[]>();
        
        for (const candidate of candidates) {
          const profile = await ctx.database.get('FileSystem', {
            userId: candidate.userId,
            groupId: session.guildId
          });

          if (profile.length > 0) {
            const classNum = candidate.classNumber;
            if (!candidatesByClass.has(classNum)) {
              candidatesByClass.set(classNum, []);
            }

            candidatesByClass.get(classNum)!.push({
              ...candidate,
              profile: profile[0]
            });
          }
        }

        let message = `📋 候选人列表\n\n`;
        message += `🗳️ 选举状态: ${election.status === 'candidate_registration' ? '报名中' : '投票中'}\n`;
        message += `👥 候选人总数: ${candidates.length}\n\n`;

        // 按班级显示候选人
        const sortedClasses = Array.from(candidatesByClass.keys()).sort((a, b) => parseInt(a) - parseInt(b));
        
        for (const classNum of sortedClasses) {
          const classCandidates = candidatesByClass.get(classNum)!;
          message += `🏫 ${classNum}班 (${classCandidates.length}人):\n`;
          
          for (const candidate of classCandidates) {
            message += `  🔢 ${candidate.candidateCode} - ${candidate.profile.realname}\n`;
            message += `    📊 监督性: ${candidate.profile.supervisionRating} | 积极性: ${candidate.profile.positivityRating}\n`;
            if (candidate.manifesto && candidate.manifesto !== '暂无竞选宣言') {
              message += `    📝 宣言: ${candidate.manifesto}\n`;
            }
            // 修复时间显示问题
            const applicationTime = candidate.applicationTime ? new Date(candidate.applicationTime) : new Date();
            message += `    ⏰ 报名时间: ${applicationTime.toLocaleString('zh-CN')}\n`;
          }
          message += '\n';
        }

        if (election.candidateRegistrationEndTime) {
          const endTime = new Date(election.candidateRegistrationEndTime);
          const now = new Date();
          if (now < endTime && election.status === 'candidate_registration') {
            message += `⏰ 报名截止: ${endTime.toLocaleString('zh-CN')}`;
          }
        }

        return message;

      } catch (error) {
        logger.error('查看候选人列表失败:', error);
        return '❌ 获取候选人列表失败';
      }
    });

  // 管理员须知命令
  ctx.command('管理员须知')
    .action(async () => {
      let message = `👑 管理员须知\n\n`;
      message += `📋 管理员职责:\n`;
      message += `• 维护群内秩序，处理违规行为\n`;
      message += `• 协助群主管理群组事务\n`;
      message += `• 公正处理群员纠纷和投诉\n`;
      message += `• 积极参与群组活动和讨论\n`;
      message += `• 以身作则，遵守群规\n\n`;
      
      message += `⚖️ 管理员权限:\n`;
      message += `• QQ群管理员权限 (禁言、踢人等)\n`;
      message += `• 使用管理员专用命令\n`;
      message += `• 参与重要决策讨论\n\n`;
      
      message += `📏 管理员义务:\n`;
      message += `• 保持活跃度，定期在线\n`;
      message += `• 接受群员监督和评价\n`;
      message += `• 参与每周连任投票\n`;
      message += `• 遵守管理员行为准则\n\n`;
      
      message += `🔄 连任机制:\n`;
      message += `• 每周进行连任投票\n`;
      message += `• 连任失败将自动卸任\n`;
      message += `• 卸任后可重新参选\n\n`;
      
      message += `⚠️ 注意事项:\n`;
      message += `• 滥用权限将被立即撤职\n`;
      message += `• 长期不活跃将被自动卸任\n`;
      message += `• 违反群规将加重处罚`;

      return message;
    });
}