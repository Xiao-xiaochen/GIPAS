import { Context } from 'koishi';
import { Config } from '../../../config';
import { ReelectionSessionManager } from './ReelectionSessionManager';
import { ReelectionVoteHandler } from './ReelectionVoteHandler';
import { ReelectionResultProcessor } from './ReelectionResultProcessor';
import { isGroupAdmin } from '../../../Utils/Group/GroupAdminManagement';

export class ReelectionCommands {
  private ctx: Context;
  private config: Config;
  private logger: any;
  private sessionManager: ReelectionSessionManager;
  private voteHandler: ReelectionVoteHandler;
  private resultProcessor: ReelectionResultProcessor;

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger('gipas:reelection-commands');
    
    // 初始化管理器
    this.sessionManager = new ReelectionSessionManager(ctx, config);
    this.voteHandler = new ReelectionVoteHandler(ctx, config, this.sessionManager);
    this.resultProcessor = new ReelectionResultProcessor(ctx, config, this.sessionManager);
    
    this.registerCommands();
  }

  private registerCommands(): void {
    // 发起连任投票命令（管理员使用）
    this.ctx.command('发起连任投票 <adminUser:user>', { authority: 4 })
      .action(async ({ session }, adminUser) => {
        if (!session?.guildId || !session?.userId) {
          return '请在群聊中使用此命令';
        }

        if (!adminUser) {
          return '❌ 请@要发起连任投票的管理员\n💡 使用格式: 发起连任投票 @管理员';
        }

        return await this.startReelectionVote(session.guildId, adminUser, session.userId);
      });

    // 支持连任命令
    this.ctx.command('支持连任 <adminUser:user>')
      .action(async ({ session }, adminUser) => {
        if (!session?.guildId || !session?.userId) {
          return '请在群聊中使用此命令';
        }

        if (!adminUser) {
          return '❌ 请@要支持连任的管理员\n💡 使用格式: 支持连任 @管理员';
        }

        return await this.processVote(session.guildId, session.userId, adminUser, true);
      });

    // 反对连任命令
    this.ctx.command('反对连任 <adminUser:user>')
      .action(async ({ session }, adminUser) => {
        if (!session?.guildId || !session?.userId) {
          return '请在群聊中使用此命令';
        }

        if (!adminUser) {
          return '❌ 请@要反对连任的管理员\n💡 使用格式: 反对连任 @管理员';
        }

        return await this.processVote(session.guildId, session.userId, adminUser, false);
      });

    // 连任投票统计命令
    this.ctx.command('连任投票统计')
      .action(async ({ session }) => {
        if (!session?.guildId) {
          return '请在群聊中使用此命令';
        }

        const result = await this.voteHandler.getVoteStatistics(session.guildId);
        return result.message;
      });

    // 连任系统状态命令
    this.ctx.command('连任系统状态')
      .action(async ({ session }) => {
        if (!session?.guildId) {
          return '请在群聊中使用此命令';
        }

        return await this.getSystemStatus(session.guildId);
      });

    // 检查连任结果命令（管理员使用）
    this.ctx.command('检查连任结果', { authority: 4 })
      .action(async ({ session }) => {
        if (!session?.guildId) {
          return '请在群聊中使用此命令';
        }

        const result = await this.resultProcessor.processResults(session.guildId);
        return result.message;
      });

    // 结束连任投票命令（管理员使用）
    this.ctx.command('结束连任投票 <adminUser:user>', { authority: 4 })
      .action(async ({ session }, adminUser) => {
        if (!session?.guildId || !adminUser) {
          return '请在群聊中使用此命令并@管理员';
        }

        return await this.endReelectionVote(session.guildId, adminUser);
      });

    // 清除连任投票命令（管理员使用）
    this.ctx.command('清除连任投票', { authority: 4 })
      .action(async ({ session }) => {
        if (!session?.guildId) {
          return '请在群聊中使用此命令';
        }

        return await this.clearAllReelectionVotes(session.guildId);
      });
  }

  /**
   * 发起连任投票
   */
  private async startReelectionVote(guildId: string, adminUserId: string, initiatorId: string): Promise<string> {
    try {
      // 统一用户ID格式
      adminUserId = adminUserId.includes(':') ? adminUserId.split(':').pop()! : adminUserId;

      // 检查被投票的用户是否是管理员
      const admin = await this.ctx.database.get('Administrator', {
        userId: adminUserId,
        guildId: guildId,
        isActive: true
      });

      if (admin.length === 0) {
        // 检查是否是实际的QQ群管理员
        const isActualAdmin = await isGroupAdmin(this.ctx, guildId, adminUserId);
        if (!isActualAdmin) {
          return '❌ 该用户不是当前管理员';
        }
        return '❌ 该用户虽然是QQ群管理员，但未在系统中注册\n💡 请使用 "同步管理员权限" 命令同步管理员信息';
      }

      // 创建投票会话
      const result = await this.sessionManager.createSession(
        guildId, 
        adminUserId, 
        initiatorId, 
        false, 
        '管理员手动发起'
      );

      if (!result.success) {
        return `❌ ${result.message}`;
      }

      // 获取管理员信息
      const adminProfile = await this.ctx.database.get('FileSystem', {
        userId: adminUserId,
        groupId: guildId
      });

      const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
      const administrator = admin[0];

      // 计算任期信息
      const appointmentTime = new Date(administrator.appointmentTime);
      const daysSinceAppointment = Math.floor((new Date().getTime() - appointmentTime.getTime()) / (1000 * 60 * 60 * 24));

      let message = `🗳️ 管理员连任投票开始！\n\n`;
      message += `👤 管理员: ${adminName} (${administrator.classNumber})\n`;
      message += `📅 任职时间: ${appointmentTime.toLocaleDateString('zh-CN')}\n`;
      message += `⏰ 任期: ${daysSinceAppointment}天\n\n`;
      message += `📊 连任投票规则:\n`;
      message += `• 需要至少3票才能生效\n`;
      message += `• 支持票数 > 反对票数 = 连任成功\n`;
      message += `• 反对票数 ≥ 支持票数 = 连任失败，自动卸任\n`;
      message += `• 只有已填写档案的成员可以投票\n`;
      message += `• 每人只能投票一次\n\n`;
      message += `💡 使用 "支持连任 @${adminName}" 支持连任\n`;
      message += `💡 使用 "反对连任 @${adminName}" 反对连任\n`;
      message += `💡 使用 "连任投票统计" 查看投票情况`;

      // 发送群内通知
      const bot = this.ctx.bots.find(bot => bot.platform === 'onebot');
      if (bot) {
        await bot.sendMessage(guildId, message);
      }

      this.logger.info(`发起连任投票: ${adminName} (${result.sessionId})`);
      return `✅ 已发起 ${adminName} 的连任投票`;

    } catch (error) {
      this.logger.error('发起连任投票失败:', error);
      return '❌ 发起连任投票失败';
    }
  }

  /**
   * 处理投票
   */
  private async processVote(guildId: string, voterId: string, adminUserId: string, isSupport: boolean): Promise<string> {
    const result = await this.voteHandler.processVote(guildId, voterId, adminUserId, isSupport);
    
    // 发送群内通知
    if (result.success && result.publicMessage) {
      const bot = this.ctx.bots.find(bot => bot.platform === 'onebot');
      if (bot) {
        await bot.sendMessage(guildId, result.publicMessage);
      }
    }

    return result.message;
  }

  /**
   * 获取系统状态
   */
  private async getSystemStatus(guildId: string): Promise<string> {
    try {
      // 获取所有活跃管理员
      const admins = await this.ctx.database.get('Administrator', {
        guildId: guildId,
        isActive: true
      });

      if (admins.length === 0) {
        return '📊 当前没有活跃的管理员';
      }

      let message = `📊 连任系统状态\n`;
      message += `👥 当前管理员数量: ${admins.length}/8\n\n`;

      // 获取所有活跃的连任投票会话
      const activeSessions = await this.sessionManager.getAllActiveSessions(guildId);
      
      // 获取所有弹劾记录
      const activeImpeachments = await this.ctx.database.get('ImpeachmentRecord', {
        guildId: guildId,
        status: 'ongoing'
      });

      for (const admin of admins) {
        const adminProfile = await this.ctx.database.get('FileSystem', {
          userId: admin.userId,
          groupId: guildId
        });

        const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
        const appointmentTime = new Date(admin.appointmentTime);
        const daysSinceAppointment = Math.floor((new Date().getTime() - appointmentTime.getTime()) / (1000 * 60 * 60 * 24));

        message += `👤 ${adminName} (${admin.classNumber})\n`;
        message += `📅 任职时间: ${appointmentTime.toLocaleDateString('zh-CN')}\n`;
        message += `⏰ 任期: ${daysSinceAppointment}天\n`;

        // 检查连任投票状态
        const reelectionSession = activeSessions.find(s => s.adminUserId === admin.userId);
        if (reelectionSession) {
          const votes = await this.ctx.database.get('ReelectionVote', {
            sessionId: reelectionSession.sessionId
          });
          const supportVotes = votes.filter(v => v.isSupport).length;
          const opposeVotes = votes.filter(v => !v.isSupport).length;
          message += `🗳️ 连任投票: ✅${supportVotes} ❌${opposeVotes}\n`;
        }

        // 检查弹劾状态
        const impeachment = activeImpeachments.find(i => i.adminUserId === admin.userId);
        if (impeachment) {
          message += `⚠️ 状态: 正在被弹劾 (ID: #${impeachment.id})\n`;
        } else if (reelectionSession) {
          message += `⚠️ 状态: 连任投票进行中\n`;
        } else if (daysSinceAppointment >= 7) {
          message += `⚠️ 状态: 需要连任投票\n`;
        } else {
          message += `✅ 状态: 正常\n`;
        }

        message += '\n';
      }

      return message;

    } catch (error) {
      this.logger.error('获取系统状态失败:', error);
      return '❌ 获取系统状态失败';
    }
  }

  /**
   * 结束连任投票
   */
  private async endReelectionVote(guildId: string, adminUserId: string): Promise<string> {
    try {
      adminUserId = adminUserId.includes(':') ? adminUserId.split(':').pop()! : adminUserId;

      const session = await this.sessionManager.getActiveSession(guildId, adminUserId);
      if (!session) {
        return '❌ 该管理员没有进行中的连任投票';
      }

      const success = await this.sessionManager.endSession(session.sessionId, 'cancelled');
      if (!success) {
        return '❌ 结束连任投票失败';
      }

      // 获取管理员信息
      const adminProfile = await this.ctx.database.get('FileSystem', {
        userId: adminUserId,
        groupId: guildId
      });
      const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';

      return `✅ 已结束 ${adminName} 的连任投票`;

    } catch (error) {
      this.logger.error('结束连任投票失败:', error);
      return '❌ 结束连任投票失败';
    }
  }

  /**
   * 清除所有连任投票
   */
  private async clearAllReelectionVotes(guildId: string): Promise<string> {
    try {
      // 获取所有活跃会话
      const activeSessions = await this.sessionManager.getAllActiveSessions(guildId);
      
      let totalCleared = 0;
      
      // 清除每个会话的投票记录并结束会话
      for (const session of activeSessions) {
        const result = await this.voteHandler.clearVotes(session.sessionId);
        totalCleared += result.count;
        await this.sessionManager.endSession(session.sessionId, 'cancelled');
      }

      this.logger.info(`清除群组 ${guildId} 的所有连任投票记录: ${totalCleared}条`);
      return `✅ 已清除 ${totalCleared} 条连任投票记录`;

    } catch (error) {
      this.logger.error('清除连任投票记录失败:', error);
      return '❌ 清除连任投票记录失败';
    }
  }
}