import { Context } from 'koishi';
import { Config } from '../../../config';
import { ReelectionSession, ReelectionVote } from '../../../type';
import { ReelectionSessionManager } from './ReelectionSessionManager';
import { setGroupAdmin } from '../../../Utils/Group/GroupAdminManagement';

export interface ReelectionResult {
  adminUserId: string;
  adminName: string;
  classNumber: string;
  supportVotes: number;
  opposeVotes: number;
  totalVotes: number;
  result: 'reelected' | 'removed' | 'pending';
  sessionId: string;
}

export class ReelectionResultProcessor {
  private ctx: Context;
  private config: Config;
  private logger: any;
  private sessionManager: ReelectionSessionManager;

  constructor(ctx: Context, config: Config, sessionManager: ReelectionSessionManager) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger('gipas:reelection-result');
    this.sessionManager = sessionManager;
  }

  /**
   * 检查并处理连任投票结果
   */
  async processResults(guildId: string): Promise<{
    success: boolean;
    message: string;
    results: ReelectionResult[];
    removedAdmins: Array<{ userId: string; name: string; classNumber: string }>;
  }> {
    try {
      const activeSessions = await this.sessionManager.getAllActiveSessions(guildId);
      
      if (activeSessions.length === 0) {
        return {
          success: false,
          message: '📊 当前没有进行中的连任投票',
          results: [],
          removedAdmins: []
        };
      }

      const results: ReelectionResult[] = [];
      const adminsToRemove: Array<{ userId: string; name: string; classNumber: string }> = [];

      for (const session of activeSessions) {
        const result = await this.processSessionResult(session);
        results.push(result);

        if (result.result === 'removed') {
          adminsToRemove.push({
            userId: result.adminUserId,
            name: result.adminName,
            classNumber: result.classNumber
          });
        }
      }

      // 处理需要卸任的管理员
      for (const adminToRemove of adminsToRemove) {
        await this.removeAdmin(guildId, adminToRemove.userId, adminToRemove.name);
      }

      // 生成结果报告
      const message = this.generateResultMessage(results, adminsToRemove);

      // 发送群内通知
      if (adminsToRemove.length > 0) {
        await this.sendPublicNotification(guildId, adminsToRemove);
      }

      this.logger.info(`连任投票结果处理完成，卸任管理员: ${adminsToRemove.length}人`);
      
      return {
        success: true,
        message,
        results,
        removedAdmins: adminsToRemove
      };

    } catch (error) {
      this.logger.error('处理连任投票结果失败:', error);
      return {
        success: false,
        message: '❌ 处理连任投票结果失败',
        results: [],
        removedAdmins: []
      };
    }
  }

  /**
   * 处理单个会话的结果
   */
  private async processSessionResult(session: ReelectionSession): Promise<ReelectionResult> {
    // 获取管理员信息
    const admin = await this.ctx.database.get('Administrator', {
      userId: session.adminUserId,
      guildId: session.guildId,
      isActive: true
    });

    const adminProfile = await this.ctx.database.get('FileSystem', {
      userId: session.adminUserId,
      groupId: session.guildId
    });

    const adminName = adminProfile.length > 0 ? adminProfile[0].realname : '未知管理员';
    const classNumber = admin.length > 0 ? admin[0].classNumber : '未知';

    // 获取投票记录
    const votes = await this.ctx.database.get('ReelectionVote', {
      sessionId: session.sessionId
    });

    const supportVotes = votes.filter(v => v.isSupport).length;
    const opposeVotes = votes.filter(v => !v.isSupport).length;
    const totalVotes = votes.length;

    // 判断结果
    let result: 'reelected' | 'removed' | 'pending' = 'pending';
    
    if (totalVotes >= session.requiredVotes) {
      if (supportVotes > opposeVotes) {
        result = 'reelected';
        // 结束会话
        await this.sessionManager.endSession(session.sessionId, 'completed');
      } else {
        result = 'removed';
        // 结束会话
        await this.sessionManager.endSession(session.sessionId, 'completed');
      }
    }

    return {
      adminUserId: session.adminUserId,
      adminName,
      classNumber,
      supportVotes,
      opposeVotes,
      totalVotes,
      result,
      sessionId: session.sessionId
    };
  }

  /**
   * 移除管理员
   */
  private async removeAdmin(guildId: string, adminUserId: string, adminName: string): Promise<void> {
    try {
      // 更新数据库状态
      await this.ctx.database.set('Administrator', 
        { userId: adminUserId, guildId: guildId }, 
        { isActive: false }
      );

      // 取消QQ群管理员权限
      try {
        await setGroupAdmin(this.ctx, guildId, adminUserId, false);
        this.logger.info(`已取消 ${adminName} 的QQ群管理员权限`);
      } catch (error) {
        this.logger.error(`取消 ${adminName} 的QQ群管理员权限失败:`, error);
      }

      this.logger.info(`管理员 ${adminName} 连任失败，已卸任`);
    } catch (error) {
      this.logger.error(`移除管理员 ${adminName} 失败:`, error);
    }
  }

  /**
   * 生成结果消息
   */
  private generateResultMessage(
    results: ReelectionResult[], 
    removedAdmins: Array<{ userId: string; name: string; classNumber: string }>
  ): string {
    let message = `📊 连任投票结果检查\n\n`;

    for (const result of results) {
      message += `👤 ${result.adminName} (${result.classNumber})\n`;
      message += `  ✅ 支持: ${result.supportVotes}票\n`;
      message += `  ❌ 反对: ${result.opposeVotes}票\n`;
      message += `  📊 总票数: ${result.totalVotes}票\n`;
      
      switch (result.result) {
        case 'reelected':
          message += `  🎉 结果: 连任成功\n`;
          break;
        case 'removed':
          message += `  ❌ 结果: 连任失败，已卸任\n`;
          break;
        case 'pending':
          message += `  ⏳ 结果: 票数不足，继续投票\n`;
          break;
      }
      message += '\n';
    }

    if (removedAdmins.length > 0) {
      message += `🔄 已卸任管理员: ${removedAdmins.map(a => a.name).join(', ')}\n`;
      message += `💡 可以发起新的选举来补充管理员`;
    }

    return message;
  }

  /**
   * 发送群内公告
   */
  private async sendPublicNotification(
    guildId: string, 
    removedAdmins: Array<{ userId: string; name: string; classNumber: string }>
  ): Promise<void> {
    try {
      const bot = this.ctx.bots.find(bot => bot.platform === 'onebot');
      if (bot) {
        const publicMessage = `📢 连任投票结果公布\n\n` +
          `❌ 以下管理员连任失败，已卸任:\n` +
          removedAdmins.map(a => `• ${a.name} (${a.classNumber})`).join('\n') +
          `\n\n🗳️ 将择期举行补选`;
        
        await bot.sendMessage(guildId, publicMessage);
      }
    } catch (error) {
      this.logger.error('发送群内通知失败:', error);
    }
  }

  /**
   * 自动检查单个管理员的连任结果
   */
  async checkSingleAdminResult(guildId: string, adminUserId: string): Promise<{
    success: boolean;
    result?: ReelectionResult;
    message: string;
  }> {
    try {
      const session = await this.sessionManager.getActiveSession(guildId, adminUserId);
      if (!session) {
        return {
          success: false,
          message: '该管理员没有进行中的连任投票'
        };
      }

      const result = await this.processSessionResult(session);
      
      if (result.result === 'removed') {
        await this.removeAdmin(guildId, adminUserId, result.adminName);
      }

      return {
        success: true,
        result,
        message: `连任投票结果: ${result.result === 'reelected' ? '连任成功' : 
                  result.result === 'removed' ? '连任失败' : '投票进行中'}`
      };

    } catch (error) {
      this.logger.error('检查单个管理员连任结果失败:', error);
      return {
        success: false,
        message: '检查连任结果失败'
      };
    }
  }
}