import { Context } from 'koishi';
import { Config } from '../../../config';
import { isGroupAdmin } from '../../../Utils/Group/GroupAdminManagement';

export interface ValidationResult {
  isValid: boolean;
  message?: string;
  data?: any;
}

export class VoteValidator {
  private ctx: Context;
  private config: Config;
  private logger: any;

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger('gipas:vote-validator');
  }

  /**
   * 验证用户是否有投票权限
   */
  async validateVoterEligibility(userId: string, guildId: string): Promise<ValidationResult> {
    try {
      // 检查投票者是否有档案
      const voterProfile = await this.ctx.database.get('FileSystem', {
        userId: userId,
        groupId: guildId
      });

      if (voterProfile.length === 0) {
        return {
          isValid: false,
          message: '❌ 请先填写个人档案才能参与投票\n💡 使用 "申请档案" 命令填写档案'
        };
      }

      return {
        isValid: true,
        data: {
          profile: voterProfile[0]
        }
      };

    } catch (error) {
      this.logger.error('验证投票者资格失败:', error);
      return {
        isValid: false,
        message: '❌ 验证投票资格失败'
      };
    }
  }

  /**
   * 验证管理员身份
   */
  async validateAdminStatus(adminUserId: string, guildId: string): Promise<ValidationResult> {
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
        // 如果数据库中没有找到，尝试从QQ群实际权限检查
        const isActualAdmin = await isGroupAdmin(this.ctx, guildId, adminUserId);
        
        if (!isActualAdmin) {
          return {
            isValid: false,
            message: '❌ 该用户不是当前管理员'
          };
        }
        
        // 如果是实际管理员但数据库中没有记录，提示需要同步
        return {
          isValid: false,
          message: '❌ 该用户虽然是QQ群管理员，但未在系统中注册\n💡 请使用 "同步管理员权限" 命令同步管理员信息'
        };
      }

      return {
        isValid: true,
        data: {
          admin: admin[0],
          adminUserId: adminUserId
        }
      };

    } catch (error) {
      this.logger.error('验证管理员身份失败:', error);
      return {
        isValid: false,
        message: '❌ 验证管理员身份失败'
      };
    }
  }

  /**
   * 验证投票是否重复
   */
  async validateDuplicateVote(
    voterId: string, 
    targetId: string, 
    voteType: 'reelection' | 'impeachment',
    sessionId?: string
  ): Promise<ValidationResult> {
    try {
      let existingVote;

      if (voteType === 'reelection' && sessionId) {
        existingVote = await this.ctx.database.get('ReelectionVote', {
          sessionId: sessionId,
          voterId: voterId
        });
      } else if (voteType === 'impeachment') {
        // 弹劾投票的重复检查逻辑（如果需要的话）
        // 这里可以根据具体的弹劾投票表结构来实现
      }

      if (existingVote && existingVote.length > 0) {
        return {
          isValid: false,
          message: '❌ 您已经对该管理员投过票了'
        };
      }

      return {
        isValid: true
      };

    } catch (error) {
      this.logger.error('验证重复投票失败:', error);
      return {
        isValid: false,
        message: '❌ 验证投票状态失败'
      };
    }
  }

  /**
   * 验证投票会话是否有效
   */
  async validateVoteSession(sessionId: string, expectedStatus: 'ongoing' | 'completed' | 'cancelled' = 'ongoing'): Promise<ValidationResult> {
    try {
      const session = await this.ctx.database.get('ReelectionSession', {
        sessionId: sessionId,
        status: expectedStatus
      });

      if (session.length === 0) {
        return {
          isValid: false,
          message: '❌ 投票会话不存在或已结束'
        };
      }

      // 检查会话是否过期（可选）
      const sessionData = session[0];
      const now = new Date();
      const startTime = new Date(sessionData.startTime);
      const hoursDiff = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);

      if (hoursDiff > 72) { // 72小时过期
        return {
          isValid: false,
          message: '❌ 投票会话已过期'
        };
      }

      return {
        isValid: true,
        data: {
          session: sessionData
        }
      };

    } catch (error) {
      this.logger.error('验证投票会话失败:', error);
      return {
        isValid: false,
        message: '❌ 验证投票会话失败'
      };
    }
  }

  /**
   * 综合验证连任投票
   */
  async validateReelectionVote(
    voterId: string,
    adminUserId: string,
    guildId: string,
    sessionId: string
  ): Promise<ValidationResult> {
    // 验证投票者资格
    const voterValidation = await this.validateVoterEligibility(voterId, guildId);
    if (!voterValidation.isValid) {
      return voterValidation;
    }

    // 验证管理员身份
    const adminValidation = await this.validateAdminStatus(adminUserId, guildId);
    if (!adminValidation.isValid) {
      return adminValidation;
    }

    // 验证投票会话
    const sessionValidation = await this.validateVoteSession(sessionId);
    if (!sessionValidation.isValid) {
      return sessionValidation;
    }

    // 验证重复投票
    const duplicateValidation = await this.validateDuplicateVote(
      voterId, 
      adminValidation.data!.adminUserId, 
      'reelection', 
      sessionId
    );
    if (!duplicateValidation.isValid) {
      return duplicateValidation;
    }

    return {
      isValid: true,
      data: {
        voter: voterValidation.data!.profile,
        admin: adminValidation.data!.admin,
        adminUserId: adminValidation.data!.adminUserId,
        session: sessionValidation.data!.session
      }
    };
  }
}