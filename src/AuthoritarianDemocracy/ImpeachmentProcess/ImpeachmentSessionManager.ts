import { Context } from 'koishi';
import { Config } from '../../config';

export class ImpeachmentSessionManager {
  constructor(private ctx: Context, private config: Config) {}

  // 发起弹劾投票
  async initiateImpeachment(
    guildId: string, 
    adminUserId: string, 
    initiatorId: string, 
    reason?: string
  ): Promise<{ success: boolean; message: string; sessionId?: string }> {
    try {
      // 检查目标是否为管理员
      const targetAdmin = await this.ctx.database.get('Administrator', {
        userId: adminUserId,
        guildId,
        isActive: true
      });

      if (targetAdmin.length === 0) {
        return { success: false, message: '目标用户不是当前管理员' };
      }

      // 检查是否已有进行中的弹劾
      const existingImpeachment = await this.ctx.database.get('ImpeachmentRecord', {
        adminUserId,
        guildId,
        status: 'ongoing'
      });

      if (existingImpeachment.length > 0) {
        // 获取用户档案信息作为显示名称
        const userRecord = await this.ctx.database.get('FileSystem', {
          userId: adminUserId,
          groupId: guildId
        });
        const adminName = userRecord[0]?.realname || `用户${adminUserId}`;
        
        return { 
          success: false, 
          message: `对管理员 ${adminName} 的弹劾投票已在进行中` 
        };
      }

      // 创建弹劾记录
      const sessionId = `impeach_${adminUserId}_${Date.now()}`;
      await this.ctx.database.create('ImpeachmentRecord', {
        adminUserId,
        guildId,
        initiatorId,
        status: 'ongoing',
        initiateTime: new Date(),
        reason: reason || '未提供理由',
        requiredVotes: 3
      });

      // 获取用户档案信息作为显示名称
      const userRecord = await this.ctx.database.get('FileSystem', {
        userId: adminUserId,
        groupId: guildId
      });
      const adminName = userRecord[0]?.realname || `用户${adminUserId}`;

      return {
        success: true,
        message: `✅ 已发起对管理员 ${adminName} 的弹劾投票`,
        sessionId
      };
    } catch (error) {
      this.ctx.logger('gipas:impeachment').error('发起弹劾时出错:', error);
      return { success: false, message: '发起弹劾时出现错误' };
    }
  }

  // 结束弹劾投票
  async completeImpeachment(
    guildId: string, 
    adminUserId: string
  ): Promise<{ success: boolean; message: string; result?: 'success' | 'failed' }> {
    try {
      // 获取进行中的弹劾记录
      const impeachment = await this.ctx.database.get('ImpeachmentRecord', {
        adminUserId,
        guildId,
        status: 'ongoing'
      });

      if (impeachment.length === 0) {
        return { success: false, message: '没有找到对该管理员的进行中弹劾投票' };
      }

      // 获取投票统计
      const votes = await this.ctx.database.get('ReelectionVote', {
        adminUserId,
        guildId
      });

      const supportVotes = votes.filter(v => v.isSupport).length;
      const opposeVotes = votes.filter(v => !v.isSupport).length;
      const totalVotes = supportVotes + opposeVotes;

      // 判断结果
      const isSuccess = totalVotes >= 3 && opposeVotes >= supportVotes;
      const result = isSuccess ? 'success' : 'failed';

      // 更新弹劾状态
      await this.ctx.database.set('ImpeachmentRecord', 
        { adminUserId, guildId, status: 'ongoing' },
        { 
          status: result, 
          endTime: new Date(),
          supportVotes,
          opposeVotes,
          totalVotes
        }
      );

      // 清除投票记录
      await this.ctx.database.remove('ReelectionVote', {
        adminUserId,
        guildId
      });

      // 获取用户档案信息作为显示名称
      const userRecord = await this.ctx.database.get('FileSystem', {
        userId: adminUserId,
        groupId: guildId
      });
      const adminName = userRecord[0]?.realname || `用户${adminUserId}`;

      return {
        success: true,
        message: `📊 弹劾投票结果\n\n👤 管理员: ${adminName}\n✅ 支持留任: ${supportVotes}票\n❌ 支持弹劾: ${opposeVotes}票\n📊 总票数: ${totalVotes}票\n\n${isSuccess ? '❌ 结果: 弹劾成功，管理员已卸任' : '✅ 结果: 弹劾失败，管理员继续任职'}`,
        result
      };
    } catch (error) {
      this.ctx.logger('gipas:impeachment').error('结束弹劾时出错:', error);
      return { success: false, message: '结束弹劾时出现错误' };
    }
  }

  // 获取弹劾统计
  async getImpeachmentStats(guildId: string): Promise<string> {
    try {
      const ongoingImpeachments = await this.ctx.database.get('ImpeachmentRecord', {
        guildId,
        status: 'ongoing'
      });

      if (ongoingImpeachments.length === 0) {
        return '📊 当前没有进行中的弹劾投票';
      }

      let message = '📊 弹劾投票统计\n\n';

      for (const impeachment of ongoingImpeachments) {
        const votes = await this.ctx.database.get('ReelectionVote', {
          adminUserId: impeachment.adminUserId,
          guildId
        });

        const supportVotes = votes.filter(v => v.isSupport).length;
        const opposeVotes = votes.filter(v => !v.isSupport).length;
        const totalVotes = supportVotes + opposeVotes;

        // 获取用户档案信息作为显示名称
        const userRecord = await this.ctx.database.get('FileSystem', {
          userId: impeachment.adminUserId,
          groupId: guildId
        });
        const adminName = userRecord[0]?.realname || `用户${impeachment.adminUserId}`;

        message += `👤 ${adminName}\n✅ 支持留任: ${supportVotes}票\n❌ 支持弹劾: ${opposeVotes}票\n📊 总票数: ${totalVotes}票\n`;
        message += `📅 发起时间: ${impeachment.initiateTime.toLocaleString('zh-CN')}\n`;
        message += `📝 理由: ${impeachment.reason}\n\n`;
      }

      message += `💡 使用 "支持连任 @管理员" 或 "反对连任 @管理员" 参与投票`;

      return message;
    } catch (error) {
      this.ctx.logger('gipas:impeachment').error('获取弹劾统计时出错:', error);
      return '获取弹劾统计时出现错误';
    }
  }

  // 检查管理员是否正在被弹劾
  async isUnderImpeachment(guildId: string, adminUserId: string): Promise<boolean> {
    try {
      const impeachment = await this.ctx.database.get('ImpeachmentRecord', {
        adminUserId,
        guildId,
        status: 'ongoing'
      });
      return impeachment.length > 0;
    } catch (error) {
      this.ctx.logger('gipas:impeachment').error('检查弹劾状态时出错:', error);
      return false;
    }
  }
}