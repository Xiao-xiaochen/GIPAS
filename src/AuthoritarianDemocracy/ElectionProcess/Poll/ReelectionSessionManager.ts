import { Context } from 'koishi';
import { Config } from '../../../config';
import { ReelectionSession } from '../../../type';

export class ReelectionSessionManager {
  private ctx: Context;
  private config: Config;
  private logger: any;

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger('gipas:reelection-session');
  }

  /**
   * 创建连任投票会话
   */
  async createSession(
    guildId: string, 
    adminUserId: string, 
    initiatorId?: string, 
    autoTriggered: boolean = false,
    reason?: string
  ): Promise<{ success: boolean; sessionId?: string; message: string }> {
    try {
      // 检查是否已有进行中的会话
      const existingSession = await this.ctx.database.get('ReelectionSession', {
        adminUserId,
        guildId,
        status: 'ongoing'
      });

      if (existingSession.length > 0) {
        return {
          success: false,
          message: '该管理员已有进行中的连任投票'
        };
      }

      // 生成会话ID
      const sessionId = `reelection_${guildId}_${adminUserId}_${Date.now()}`;

      // 创建会话
      await this.ctx.database.create('ReelectionSession', {
        sessionId,
        adminUserId,
        guildId,
        initiatorId,
        startTime: new Date(),
        status: 'ongoing',
        requiredVotes: 3,
        autoTriggered,
        reason: reason || (autoTriggered ? '任期到期自动触发' : '手动发起')
      });

      this.logger.info(`创建连任投票会话: ${sessionId}`);
      
      return {
        success: true,
        sessionId,
        message: '连任投票会话创建成功'
      };

    } catch (error) {
      this.logger.error('创建连任投票会话失败:', error);
      return {
        success: false,
        message: '创建连任投票会话失败'
      };
    }
  }

  /**
   * 获取活跃的投票会话
   */
  async getActiveSession(guildId: string, adminUserId: string): Promise<ReelectionSession | null> {
    try {
      const sessions = await this.ctx.database.get('ReelectionSession', {
        adminUserId,
        guildId,
        status: 'ongoing'
      });

      return sessions.length > 0 ? sessions[0] : null;
    } catch (error) {
      this.logger.error('获取活跃投票会话失败:', error);
      return null;
    }
  }

  /**
   * 结束投票会话
   */
  async endSession(sessionId: string, status: 'completed' | 'cancelled'): Promise<boolean> {
    try {
      await this.ctx.database.set('ReelectionSession', 
        { sessionId }, 
        { 
          status,
          endTime: new Date()
        }
      );

      this.logger.info(`结束连任投票会话: ${sessionId}, 状态: ${status}`);
      return true;
    } catch (error) {
      this.logger.error('结束投票会话失败:', error);
      return false;
    }
  }

  /**
   * 获取所有进行中的会话
   */
  async getAllActiveSessions(guildId: string): Promise<ReelectionSession[]> {
    try {
      return await this.ctx.database.get('ReelectionSession', {
        guildId,
        status: 'ongoing'
      });
    } catch (error) {
      this.logger.error('获取所有活跃会话失败:', error);
      return [];
    }
  }

  /**
   * 检查会话是否过期（可选功能，用于自动清理）
   */
  async checkExpiredSessions(guildId: string, maxDurationHours: number = 72): Promise<string[]> {
    try {
      const activeSessions = await this.getAllActiveSessions(guildId);
      const expiredSessionIds: string[] = [];
      const now = new Date();

      for (const session of activeSessions) {
        const startTime = new Date(session.startTime);
        const hoursDiff = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        
        if (hoursDiff > maxDurationHours) {
          expiredSessionIds.push(session.sessionId);
          await this.endSession(session.sessionId, 'cancelled');
        }
      }

      return expiredSessionIds;
    } catch (error) {
      this.logger.error('检查过期会话失败:', error);
      return [];
    }
  }
}