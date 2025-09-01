import { Context } from 'koishi';
import { Config } from '../../../config';
import { ReelectionCommands } from './ReelectionCommands';
import { ReelectionSessionManager } from './ReelectionSessionManager';
import { ReelectionVoteHandler } from './ReelectionVoteHandler';
import { ReelectionResultProcessor } from './ReelectionResultProcessor';
import { addMigrationCommands } from './migration';
import { addTestCommands } from './test';

export class ReelectionPollSystem {
  private ctx: Context;
  private config: Config;
  private logger: any;
  private commands: ReelectionCommands;
  private sessionManager: ReelectionSessionManager;
  private voteHandler: ReelectionVoteHandler;
  private resultProcessor: ReelectionResultProcessor;

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger('gipas:reelection-system');
    
    // 初始化各个组件
    this.sessionManager = new ReelectionSessionManager(ctx, config);
    this.voteHandler = new ReelectionVoteHandler(ctx, config, this.sessionManager);
    this.resultProcessor = new ReelectionResultProcessor(ctx, config, this.sessionManager);
    this.commands = new ReelectionCommands(ctx, config);
    
    // 启动定时任务
    this.startScheduledTasks();
    
    // 添加迁移命令
    addMigrationCommands(ctx, config);
    
    // 添加测试命令
    addTestCommands(ctx, config);
    
    this.logger.info('连任投票系统已启动');
  }

  /**
   * 启动定时任务
   */
  private startScheduledTasks(): void {
    // 每小时检查一次过期的投票会话
    this.ctx.setInterval(async () => {
      try {
        const guilds = await this.getActiveGuilds();
        for (const guildId of guilds) {
          const expiredSessions = await this.sessionManager.checkExpiredSessions(guildId, 72); // 72小时过期
          if (expiredSessions.length > 0) {
            this.logger.info(`清理群组 ${guildId} 的过期投票会话: ${expiredSessions.length}个`);
          }
        }
      } catch (error) {
        this.logger.error('定时清理过期会话失败:', error);
      }
    }, 60 * 60 * 1000); // 每小时执行一次

    // 每天检查一次需要自动发起连任投票的管理员
    this.ctx.setInterval(async () => {
      try {
        const guilds = await this.getActiveGuilds();
        for (const guildId of guilds) {
          await this.checkAutoReelectionTrigger(guildId);
        }
      } catch (error) {
        this.logger.error('定时检查自动连任触发失败:', error);
      }
    }, 24 * 60 * 60 * 1000); // 每天执行一次
  }

  /**
   * 获取有活跃管理员的群组列表
   */
  private async getActiveGuilds(): Promise<string[]> {
    try {
      const admins = await this.ctx.database.get('Administrator', {
        isActive: true
      });
      
      const guildIds = [...new Set(admins.map(admin => admin.guildId))];
      return guildIds;
    } catch (error) {
      this.logger.error('获取活跃群组失败:', error);
      return [];
    }
  }

  /**
   * 检查是否需要自动触发连任投票
   */
  private async checkAutoReelectionTrigger(guildId: string): Promise<void> {
    try {
      // 获取所有活跃管理员
      const admins = await this.ctx.database.get('Administrator', {
        guildId: guildId,
        isActive: true
      });

      for (const admin of admins) {
        // 检查任期是否超过7天
        const appointmentTime = new Date(admin.appointmentTime);
        const daysSinceAppointment = Math.floor((new Date().getTime() - appointmentTime.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysSinceAppointment >= 7) {
          // 检查是否已有进行中的连任投票
          const existingSession = await this.sessionManager.getActiveSession(guildId, admin.userId);
          if (existingSession) {
            continue; // 已有投票会话，跳过
          }

          // 检查是否正在被弹劾
          const activeImpeachment = await this.ctx.database.get('ImpeachmentRecord', {
            adminUserId: admin.userId,
            guildId: guildId,
            status: 'ongoing'
          });

          if (activeImpeachment.length > 0) {
            continue; // 正在被弹劾，跳过
          }

          // 自动发起连任投票
          const result = await this.sessionManager.createSession(
            guildId,
            admin.userId,
            undefined, // 系统自动发起，无发起人
            true, // 自动触发
            `任期满7天自动触发连任投票`
          );

          if (result.success) {
            // 获取管理员信息并发送通知
            const adminProfile = await this.ctx.database.get('FileSystem', {
              userId: admin.userId,
              groupId: guildId
            });

            const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
            
            // 发送群内通知
            const bot = this.ctx.bots.find(bot => bot.platform === 'onebot');
            if (bot) {
              const message = `🔔 系统自动提醒\n\n` +
                `👤 管理员 ${adminName} (${admin.classNumber}) 任期已满7天\n` +
                `🗳️ 已自动发起连任投票\n\n` +
                `💡 使用 "支持连任 @${adminName}" 或 "反对连任 @${adminName}" 进行投票\n` +
                `💡 使用 "连任投票统计" 查看投票情况`;
              
              await bot.sendMessage(guildId, message);
            }

            this.logger.info(`自动发起连任投票: ${adminName} (${admin.classNumber})`);
          }
        }
      }
    } catch (error) {
      this.logger.error(`检查群组 ${guildId} 自动连任触发失败:`, error);
    }
  }

  /**
   * 获取系统统计信息
   */
  async getSystemStats(): Promise<{
    totalActiveSessions: number;
    totalActiveAdmins: number;
    totalGuilds: number;
  }> {
    try {
      const guilds = await this.getActiveGuilds();
      let totalActiveSessions = 0;
      
      for (const guildId of guilds) {
        const sessions = await this.sessionManager.getAllActiveSessions(guildId);
        totalActiveSessions += sessions.length;
      }

      const admins = await this.ctx.database.get('Administrator', {
        isActive: true
      });

      return {
        totalActiveSessions,
        totalActiveAdmins: admins.length,
        totalGuilds: guilds.length
      };
    } catch (error) {
      this.logger.error('获取系统统计失败:', error);
      return {
        totalActiveSessions: 0,
        totalActiveAdmins: 0,
        totalGuilds: 0
      };
    }
  }

  /**
   * 手动触发连任投票检查（用于测试或管理）
   */
  async manualReelectionCheck(guildId: string): Promise<string> {
    try {
      await this.checkAutoReelectionTrigger(guildId);
      return '✅ 连任投票检查完成';
    } catch (error) {
      this.logger.error('手动连任投票检查失败:', error);
      return '❌ 连任投票检查失败';
    }
  }

  /**
   * 获取管理器实例（用于外部调用）
   */
  getSessionManager(): ReelectionSessionManager {
    return this.sessionManager;
  }

  getVoteHandler(): ReelectionVoteHandler {
    return this.voteHandler;
  }

  getResultProcessor(): ReelectionResultProcessor {
    return this.resultProcessor;
  }
}

// 导出主函数，保持与原有代码的兼容性
export function ReelectionPoll(ctx: Context, config: Config): ReelectionPollSystem {
  return new ReelectionPollSystem(ctx, config);
}