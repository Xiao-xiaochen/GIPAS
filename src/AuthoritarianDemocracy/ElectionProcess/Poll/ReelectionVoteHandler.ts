import { Context } from 'koishi';
import { Config } from '../../../config';
import { ReelectionVote, ReelectionSession } from '../../../type';
import { ReelectionSessionManager } from './ReelectionSessionManager';

export class ReelectionVoteHandler {
  private ctx: Context;
  private config: Config;
  private logger: any;
  private sessionManager: ReelectionSessionManager;

  constructor(ctx: Context, config: Config, sessionManager: ReelectionSessionManager) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger('gipas:reelection-vote');
    this.sessionManager = sessionManager;
  }

  /**
   * 处理连任投票
   */
  async processVote(
    guildId: string, 
    voterId: string, 
    adminUserId: string, 
    isSupport: boolean
  ): Promise<{ success: boolean; message: string; publicMessage?: string }> {
    try {
      // 统一用户ID格式
      adminUserId = adminUserId.includes(':') ? adminUserId.split(':').pop()! : adminUserId;

      // 检查投票者是否有档案
      const voterProfile = await this.ctx.database.get('FileSystem', {
        userId: voterId,
        groupId: guildId
      });

      if (voterProfile.length === 0) {
        return {
          success: false,
          message: '❌ 请先填写个人档案才能参与投票\n💡 使用 "申请档案" 命令填写档案'
        };
      }

      // 检查被投票的用户是否是管理员
      const admin = await this.ctx.database.get('Administrator', {
        userId: adminUserId,
        guildId: guildId,
        isActive: true
      });

      if (admin.length === 0) {
        return {
          success: false,
          message: '❌ 该用户不是当前管理员'
        };
      }

      // 获取活跃的投票会话
      const session = await this.sessionManager.getActiveSession(guildId, adminUserId);
      if (!session) {
        return {
          success: false,
          message: '❌ 该管理员当前没有进行中的连任投票\n💡 请先发起连任投票'
        };
      }

      // 检查是否已经投过票
      const existingVote = await this.ctx.database.get('ReelectionVote', {
        sessionId: session.sessionId,
        voterId: voterId
      });

      if (existingVote.length > 0) {
        return {
          success: false,
          message: '❌ 您已经对该管理员投过票了'
        };
      }

      // 记录投票
      await this.ctx.database.create('ReelectionVote', {
        sessionId: session.sessionId,
        adminUserId: adminUserId,
        guildId: guildId,
        voterId: voterId,
        isSupport: isSupport,
        voteTime: new Date()
      });

      // 获取管理员和投票者信息
      const adminProfile = await this.ctx.database.get('FileSystem', {
        userId: adminUserId,
        groupId: guildId
      });

      const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
      const voterName = voterProfile[0].realname;

      const message = `✅ 连任投票成功！\n\n` +
        `👤 管理员: ${adminName}\n` +
        `🗳️ 您的投票: ${isSupport ? '支持连任' : '反对连任'}\n` +
        `⏰ 投票时间: ${new Date().toLocaleString('zh-CN')}\n\n` +
        `💡 投票已记录，无法修改`;

      const publicMessage = `🗳️ ${voterName} ${isSupport ? '支持' : '反对'} ${adminName} 连任`;

      this.logger.info(`用户 ${voterId} ${isSupport ? '支持' : '反对'} 管理员 ${adminUserId} 连任`);
      
      return {
        success: true,
        message,
        publicMessage
      };

    } catch (error) {
      this.logger.error('连任投票失败:', error);
      return {
        success: false,
        message: '❌ 投票失败，请稍后重试'
      };
    }
  }

  /**
   * 获取投票统计
   */
  async getVoteStatistics(guildId: string, sessionId?: string): Promise<{
    success: boolean;
    message: string;
    statistics?: Array<{
      adminName: string;
      classNumber: string;
      supportVotes: number;
      opposeVotes: number;
      totalVotes: number;
      supportRate: number;
      daysSinceAppointment: number;
      sessionStatus: string;
    }>;
  }> {
    try {
      let sessions: ReelectionSession[];
      
      if (sessionId) {
        const session = await this.ctx.database.get('ReelectionSession', { sessionId });
        sessions = session;
      } else {
        sessions = await this.sessionManager.getAllActiveSessions(guildId);
      }

      if (sessions.length === 0) {
        return {
          success: false,
          message: '📊 当前没有进行中的连任投票'
        };
      }

      const statistics = [];
      let message = `📊 连任投票统计\n\n`;

      for (const session of sessions) {
        // 获取管理员信息
        const admin = await this.ctx.database.get('Administrator', {
          userId: session.adminUserId,
          guildId: guildId,
          isActive: true
        });

        if (admin.length === 0) continue;

        const adminProfile = await this.ctx.database.get('FileSystem', {
          userId: session.adminUserId,
          groupId: guildId
        });

        const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';

        // 获取该会话的所有投票
        const votes = await this.ctx.database.get('ReelectionVote', {
          sessionId: session.sessionId
        });

        const supportVotes = votes.filter(v => v.isSupport);
        const opposeVotes = votes.filter(v => !v.isSupport);
        const supportRate = votes.length > 0 ? Math.round((supportVotes.length / votes.length) * 100) : 0;

        // 计算任期天数
        const appointmentTime = new Date(admin[0].appointmentTime);
        const daysSinceAppointment = Math.floor((new Date().getTime() - appointmentTime.getTime()) / (1000 * 60 * 60 * 24));

        message += `👤 ${adminName} (${admin[0].classNumber})\n`;
        message += `✅ 支持: ${supportVotes.length}票\n`;
        message += `❌ 反对: ${opposeVotes.length}票\n`;
        message += `📊 总票数: ${votes.length}票\n`;
        
        if (votes.length > 0) {
          message += `📈 支持率: ${supportRate}%\n`;
        }
        
        message += `⏰ 任期: ${daysSinceAppointment}天\n`;
        message += `📋 状态: ${session.status === 'ongoing' ? '进行中' : '已结束'}\n\n`;

        statistics.push({
          adminName,
          classNumber: admin[0].classNumber,
          supportVotes: supportVotes.length,
          opposeVotes: opposeVotes.length,
          totalVotes: votes.length,
          supportRate,
          daysSinceAppointment,
          sessionStatus: session.status
        });
      }

      message += `💡 使用 "支持连任 @管理员" 或 "反对连任 @管理员" 进行投票`;

      return {
        success: true,
        message,
        statistics
      };

    } catch (error) {
      this.logger.error('获取投票统计失败:', error);
      return {
        success: false,
        message: '❌ 获取投票统计失败'
      };
    }
  }

  /**
   * 清除指定会话的投票记录
   */
  async clearVotes(sessionId: string): Promise<{ success: boolean; count: number }> {
    try {
      const result = await this.ctx.database.remove('ReelectionVote', { sessionId });
      this.logger.info(`清除会话 ${sessionId} 的投票记录: ${result.removed}条`);
      
      return {
        success: true,
        count: result.removed
      };
    } catch (error) {
      this.logger.error('清除投票记录失败:', error);
      return {
        success: false,
        count: 0
      };
    }
  }
}