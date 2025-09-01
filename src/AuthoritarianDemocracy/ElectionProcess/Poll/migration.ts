import { Context } from 'koishi';
import { Config } from '../../../config';

/**
 * 数据迁移工具 - 从旧的连任投票系统迁移到新的会话管理系统
 */
export class ReelectionDataMigration {
  private ctx: Context;
  private config: Config;
  private logger: any;

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger('gipas:reelection-migration');
  }

  /**
   * 执行数据迁移
   */
  async migrate(): Promise<{
    success: boolean;
    message: string;
    migratedSessions: number;
    migratedVotes: number;
  }> {
    try {
      this.logger.info('开始连任投票数据迁移...');

      // 1. 检查是否已经迁移过
      const existingSessions = await this.ctx.database.get('ReelectionSession', {});
      if (existingSessions.length > 0) {
        return {
          success: false,
          message: '数据已经迁移过，无需重复迁移',
          migratedSessions: 0,
          migratedVotes: 0
        };
      }

      // 2. 获取所有现有的连任投票记录
      const existingVotes = await this.ctx.database.get('ReelectionVote', {});
      
      if (existingVotes.length === 0) {
        return {
          success: true,
          message: '没有需要迁移的数据',
          migratedSessions: 0,
          migratedVotes: 0
        };
      }

      // 3. 按管理员和群组分组投票记录
      const voteGroups = this.groupVotesByAdmin(existingVotes);
      
      let migratedSessions = 0;
      let migratedVotes = 0;

      // 4. 为每个管理员创建投票会话
      for (const [key, votes] of voteGroups.entries()) {
        const [adminUserId, guildId] = key.split('|');
        
        // 创建会话
        const sessionId = `migration_${guildId}_${adminUserId}_${Date.now()}`;
        
        // 获取最早的投票时间作为会话开始时间
        const earliestVote = votes.reduce((earliest, vote) => 
          new Date(vote.voteTime) < new Date(earliest.voteTime) ? vote : earliest
        );

        await this.ctx.database.create('ReelectionSession', {
          sessionId,
          adminUserId,
          guildId,
          initiatorId: undefined, // 迁移的数据没有发起人信息
          startTime: new Date(earliestVote.voteTime),
          status: 'ongoing', // 假设都是进行中的
          requiredVotes: 3,
          autoTriggered: false,
          reason: '数据迁移创建的会话'
        });

        migratedSessions++;

        // 5. 更新投票记录，添加sessionId
        for (const vote of votes) {
          await this.ctx.database.set('ReelectionVote', 
            { id: vote.id }, 
            { sessionId }
          );
          migratedVotes++;
        }

        this.logger.info(`迁移管理员 ${adminUserId} 的投票会话，包含 ${votes.length} 票`);
      }

      this.logger.info(`数据迁移完成: ${migratedSessions}个会话, ${migratedVotes}票`);

      return {
        success: true,
        message: `迁移成功: 创建了${migratedSessions}个投票会话，迁移了${migratedVotes}票`,
        migratedSessions,
        migratedVotes
      };

    } catch (error) {
      this.logger.error('数据迁移失败:', error);
      return {
        success: false,
        message: '数据迁移失败: ' + error.message,
        migratedSessions: 0,
        migratedVotes: 0
      };
    }
  }

  /**
   * 按管理员和群组分组投票记录
   */
  private groupVotesByAdmin(votes: any[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();

    for (const vote of votes) {
      const key = `${vote.adminUserId}|${vote.guildId}`;
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      
      groups.get(key)!.push(vote);
    }

    return groups;
  }

  /**
   * 验证迁移结果
   */
  async validateMigration(): Promise<{
    isValid: boolean;
    message: string;
    details: {
      totalSessions: number;
      totalVotes: number;
      orphanedVotes: number;
    };
  }> {
    try {
      // 检查所有投票记录是否都有对应的会话
      const allVotes = await this.ctx.database.get('ReelectionVote', {});
      const allSessions = await this.ctx.database.get('ReelectionSession', {});

      const sessionIds = new Set(allSessions.map(s => s.sessionId));
      const orphanedVotes = allVotes.filter(v => v.sessionId && !sessionIds.has(v.sessionId));

      const isValid = orphanedVotes.length === 0;

      return {
        isValid,
        message: isValid 
          ? '迁移验证通过，所有数据完整' 
          : `发现${orphanedVotes.length}个孤立的投票记录`,
        details: {
          totalSessions: allSessions.length,
          totalVotes: allVotes.length,
          orphanedVotes: orphanedVotes.length
        }
      };

    } catch (error) {
      this.logger.error('验证迁移结果失败:', error);
      return {
        isValid: false,
        message: '验证失败: ' + error.message,
        details: {
          totalSessions: 0,
          totalVotes: 0,
          orphanedVotes: 0
        }
      };
    }
  }

  /**
   * 回滚迁移（仅用于测试）
   */
  async rollback(): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.warn('开始回滚连任投票数据迁移...');

      // 删除所有迁移创建的会话
      const migrationSessions = await this.ctx.database.get('ReelectionSession', {
        reason: '数据迁移创建的会话'
      });

      for (const session of migrationSessions) {
        // 清除投票记录中的sessionId
        await this.ctx.database.set('ReelectionVote', 
          { sessionId: session.sessionId }, 
          { sessionId: null }
        );
      }

      // 删除迁移会话
      const deletedSessions = await this.ctx.database.remove('ReelectionSession', {
        reason: '数据迁移创建的会话'
      });

      this.logger.warn(`回滚完成: 删除了${deletedSessions.removed}个迁移会话`);

      return {
        success: true,
        message: `回滚成功: 删除了${deletedSessions.removed}个迁移会话`
      };

    } catch (error) {
      this.logger.error('回滚迁移失败:', error);
      return {
        success: false,
        message: '回滚失败: ' + error.message
      };
    }
  }
}

/**
 * 添加迁移命令
 */
export function addMigrationCommands(ctx: Context, config: Config): void {
  const migration = new ReelectionDataMigration(ctx, config);

  // 执行迁移命令（超级管理员权限）
  ctx.command('迁移连任投票数据', { authority: 5 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      const result = await migration.migrate();
      return result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
    });

  // 验证迁移命令
  ctx.command('验证连任投票迁移', { authority: 4 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      const result = await migration.validateMigration();
      let message = result.isValid ? `✅ ${result.message}` : `❌ ${result.message}`;
      message += `\n\n📊 统计信息:`;
      message += `\n• 投票会话: ${result.details.totalSessions}个`;
      message += `\n• 投票记录: ${result.details.totalVotes}条`;
      if (result.details.orphanedVotes > 0) {
        message += `\n• 孤立记录: ${result.details.orphanedVotes}条`;
      }

      return message;
    });

  // 回滚迁移命令（仅用于测试，超级管理员权限）
  ctx.command('回滚连任投票迁移', { authority: 5 })
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      const result = await migration.rollback();
      return result.success ? `✅ ${result.message}` : `❌ ${result.message}`;
    });
}