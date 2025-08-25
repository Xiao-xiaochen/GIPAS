import { Context } from 'koishi';

/**
 * 修复候选人数据的工具函数
 * 用于统一班级格式和候选人编号
 */
export async function fixCandidateData(ctx: Context, guildId: string): Promise<{
  fixed: number;
  errors: string[];
}> {
  const logger = ctx.logger('gipas:fix-candidate-data');
  const results = { fixed: 0, errors: [] };

  try {
    // 获取所有候选人记录
    const candidates = await ctx.database.get('ElectionCandidate', { guildId });
    
    if (candidates.length === 0) {
      logger.info('没有需要修复的候选人数据');
      return results;
    }

    logger.info(`开始修复 ${candidates.length} 条候选人记录`);

    // 按选举分组处理
    const candidatesByElection = new Map<string, any[]>();
    for (const candidate of candidates) {
      if (!candidatesByElection.has(candidate.electionId)) {
        candidatesByElection.set(candidate.electionId, []);
      }
      candidatesByElection.get(candidate.electionId)!.push(candidate);
    }

    for (const [electionId, electionCandidates] of candidatesByElection) {
      logger.info(`处理选举 ${electionId} 的 ${electionCandidates.length} 个候选人`);

      // 按班级重新分组和编号
      const candidatesByClass = new Map<string, any[]>();
      
      for (const candidate of electionCandidates) {
        try {
          // 获取用户档案以获取正确的班级信息
          const profile = await ctx.database.get('FileSystem', {
            userId: candidate.userId,
            groupId: guildId
          });

          if (profile.length === 0) {
            results.errors.push(`候选人 ${candidate.userId} 没有档案记录`);
            continue;
          }

          // 标准化班级格式
          const originalClass = profile[0].Class;
          const standardizedClass = originalClass.replace(/[^\d]/g, ''); // 移除所有非数字字符
          
          if (!standardizedClass) {
            results.errors.push(`候选人 ${candidate.userId} 的班级格式无法解析: ${originalClass}`);
            continue;
          }

          if (!candidatesByClass.has(standardizedClass)) {
            candidatesByClass.set(standardizedClass, []);
          }

          candidatesByClass.get(standardizedClass)!.push({
            ...candidate,
            standardizedClass,
            profile: profile[0]
          });

        } catch (error) {
          results.errors.push(`处理候选人 ${candidate.userId} 时出错: ${error.message}`);
        }
      }

      // 为每个班级重新生成候选人编号
      for (const [classNum, classCandidates] of candidatesByClass) {
        // 按报名时间排序，确保编号的一致性
        classCandidates.sort((a, b) => {
          const timeA = a.applicationTime ? new Date(a.applicationTime).getTime() : 0;
          const timeB = b.applicationTime ? new Date(b.applicationTime).getTime() : 0;
          return timeA - timeB;
        });

        for (let i = 0; i < classCandidates.length; i++) {
          const candidate = classCandidates[i];
          const newSequence = i + 1;
          const newCandidateCode = `${classNum}${newSequence.toString().padStart(2, '0')}`;

          // 只有当数据需要更新时才更新
          if (candidate.classNumber !== classNum || candidate.candidateCode !== newCandidateCode) {
            try {
              await ctx.database.set('ElectionCandidate', 
                { id: candidate.id }, 
                {
                  classNumber: classNum,
                  candidateCode: newCandidateCode
                }
              );

              logger.info(`更新候选人 ${candidate.profile.realname}: ${candidate.candidateCode} -> ${newCandidateCode}`);
              results.fixed++;

            } catch (error) {
              results.errors.push(`更新候选人 ${candidate.userId} 失败: ${error.message}`);
            }
          }
        }
      }
    }

    logger.info(`数据修复完成: 修复 ${results.fixed} 条记录, ${results.errors.length} 个错误`);
    return results;

  } catch (error) {
    logger.error('修复候选人数据失败:', error);
    results.errors.push(`系统错误: ${error.message}`);
    return results;
  }
}

/**
 * 为选举系统添加数据修复命令
 */
export function addDataFixCommands(ctx: Context) {
  const logger = ctx.logger('gipas:data-fix');

  // 修复候选人数据命令（管理员使用）
  ctx.command('修复候选人数据', { authority: 4 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        const results = await fixCandidateData(ctx, session.guildId);

        let message = `🔧 候选人数据修复完成\n\n`;
        message += `✅ 修复记录: ${results.fixed}条\n`;
        
        if (results.errors.length > 0) {
          message += `❌ 错误数量: ${results.errors.length}个\n\n`;
          message += `错误详情:\n`;
          for (const error of results.errors.slice(0, 5)) { // 只显示前5个错误
            message += `• ${error}\n`;
          }
          if (results.errors.length > 5) {
            message += `• ... 还有 ${results.errors.length - 5} 个错误\n`;
          }
        }

        if (results.fixed > 0) {
          message += `\n💡 建议重新查看候选人列表确认修复结果`;
        }

        return message;

      } catch (error) {
        logger.error('执行数据修复失败:', error);
        return '❌ 数据修复失败，请查看日志';
      }
    });

  // 检查候选人数据一致性命令
  ctx.command('检查候选人数据', { authority: 4 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        const candidates = await ctx.database.get('ElectionCandidate', { 
          guildId: session.guildId 
        });

        if (candidates.length === 0) {
          return '📊 没有候选人数据需要检查';
        }

        let message = `📊 候选人数据检查报告\n\n`;
        message += `👥 总候选人数: ${candidates.length}\n\n`;

        const issues = [];
        const classCounts = new Map<string, number>();

        for (const candidate of candidates) {
          // 检查班级格式
          if (!/^\d+$/.test(candidate.classNumber)) {
            issues.push(`候选人 ${candidate.candidateCode} 班级格式异常: ${candidate.classNumber}`);
          }

          // 检查编号格式
          if (!/^\d{3,4}$/.test(candidate.candidateCode)) {
            issues.push(`候选人 ${candidate.candidateCode} 编号格式异常`);
          }

          // 统计班级分布
          classCounts.set(candidate.classNumber, (classCounts.get(candidate.classNumber) || 0) + 1);
        }

        // 显示班级分布
        message += `📋 班级分布:\n`;
        const sortedClasses = Array.from(classCounts.entries()).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
        for (const [classNum, count] of sortedClasses) {
          message += `• ${classNum}班: ${count}人\n`;
        }

        // 显示问题
        if (issues.length > 0) {
          message += `\n⚠️ 发现问题 (${issues.length}个):\n`;
          for (const issue of issues.slice(0, 10)) {
            message += `• ${issue}\n`;
          }
          if (issues.length > 10) {
            message += `• ... 还有 ${issues.length - 10} 个问题\n`;
          }
          message += `\n💡 使用 "修复候选人数据" 命令进行修复`;
        } else {
          message += `\n✅ 数据格式正常，无需修复`;
        }

        return message;

      } catch (error) {
        logger.error('检查候选人数据失败:', error);
        return '❌ 数据检查失败';
      }
    });

  logger.info('候选人数据修复命令已加载');
}