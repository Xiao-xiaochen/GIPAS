import { Context } from 'koishi';
import { Config } from '../../../config';

export interface NotificationData {
  guildId: string;
  type: 'vote_cast' | 'session_start' | 'session_end' | 'result_announcement' | 'auto_trigger';
  title?: string;
  content: string;
  mentions?: string[];
  isPublic?: boolean;
}

export class VoteNotifier {
  private ctx: Context;
  private config: Config;
  private logger: any;

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger('gipas:vote-notifier');
  }

  /**
   * 发送投票通知
   */
  async sendNotification(notification: NotificationData): Promise<boolean> {
    try {
      const bot = this.ctx.bots.find(bot => bot.platform === 'onebot');
      if (!bot) {
        this.logger.warn('未找到可用的机器人实例');
        return false;
      }

      let message = '';
      
      if (notification.title) {
        message += `${notification.title}\n\n`;
      }
      
      message += notification.content;

      // 添加@提及
      if (notification.mentions && notification.mentions.length > 0) {
        const mentionText = notification.mentions.map(userId => `@${userId}`).join(' ');
        message += `\n\n${mentionText}`;
      }

      await bot.sendMessage(notification.guildId, message);
      
      this.logger.info(`发送通知成功: ${notification.type} - ${notification.guildId}`);
      return true;

    } catch (error) {
      this.logger.error('发送通知失败:', error);
      return false;
    }
  }

  /**
   * 发送投票成功通知
   */
  async notifyVoteCast(
    guildId: string,
    voterName: string,
    adminName: string,
    isSupport: boolean,
    voteType: 'reelection' | 'impeachment' = 'reelection'
  ): Promise<boolean> {
    const actionText = voteType === 'reelection' 
      ? (isSupport ? '支持' : '反对') + ' 连任'
      : (isSupport ? '支持' : '反对') + ' 弹劾';

    return await this.sendNotification({
      guildId,
      type: 'vote_cast',
      content: `🗳️ ${voterName} ${actionText} ${adminName}`,
      isPublic: true
    });
  }

  /**
   * 发送投票会话开始通知
   */
  async notifySessionStart(
    guildId: string,
    adminName: string,
    classNumber: string,
    daysSinceAppointment: number,
    isAutoTriggered: boolean = false
  ): Promise<boolean> {
    const appointmentDate = new Date();
    appointmentDate.setDate(appointmentDate.getDate() - daysSinceAppointment);

    let content = '';
    
    if (isAutoTriggered) {
      content = `🔔 系统自动提醒\n\n` +
        `👤 管理员 ${adminName} (${classNumber}) 任期已满7天\n` +
        `🗳️ 已自动发起连任投票\n\n`;
    } else {
      content = `🗳️ 管理员连任投票开始！\n\n` +
        `👤 管理员: ${adminName} (${classNumber})\n` +
        `📅 任职时间: ${appointmentDate.toLocaleDateString('zh-CN')}\n` +
        `⏰ 任期: ${daysSinceAppointment}天\n\n` +
        `📊 连任投票规则:\n` +
        `• 需要至少3票才能生效\n` +
        `• 支持票数 > 反对票数 = 连任成功\n` +
        `• 反对票数 ≥ 支持票数 = 连任失败，自动卸任\n` +
        `• 只有已填写档案的成员可以投票\n` +
        `• 每人只能投票一次\n\n`;
    }

    content += `💡 使用 "支持连任 @${adminName}" 支持连任\n` +
      `💡 使用 "反对连任 @${adminName}" 反对连任\n` +
      `💡 使用 "连任投票统计" 查看投票情况`;

    return await this.sendNotification({
      guildId,
      type: 'session_start',
      content,
      isPublic: true
    });
  }

  /**
   * 发送投票结果通知
   */
  async notifyResults(
    guildId: string,
    removedAdmins: Array<{ name: string; classNumber: string }>,
    reelectedAdmins: Array<{ name: string; classNumber: string }> = []
  ): Promise<boolean> {
    if (removedAdmins.length === 0 && reelectedAdmins.length === 0) {
      return true; // 没有需要通知的结果
    }

    let content = `📢 连任投票结果公布\n\n`;

    if (removedAdmins.length > 0) {
      content += `❌ 以下管理员连任失败，已卸任:\n`;
      content += removedAdmins.map(a => `• ${a.name} (${a.classNumber})`).join('\n');
      content += `\n\n🗳️ 将择期举行补选`;
    }

    if (reelectedAdmins.length > 0) {
      if (removedAdmins.length > 0) {
        content += `\n\n`;
      }
      content += `✅ 以下管理员连任成功:\n`;
      content += reelectedAdmins.map(a => `• ${a.name} (${a.classNumber})`).join('\n');
    }

    return await this.sendNotification({
      guildId,
      type: 'result_announcement',
      content,
      isPublic: true
    });
  }

  /**
   * 发送投票会话结束通知
   */
  async notifySessionEnd(
    guildId: string,
    adminName: string,
    reason: 'completed' | 'cancelled' | 'expired'
  ): Promise<boolean> {
    let content = '';
    
    switch (reason) {
      case 'completed':
        content = `✅ ${adminName} 的连任投票已完成`;
        break;
      case 'cancelled':
        content = `❌ ${adminName} 的连任投票已取消`;
        break;
      case 'expired':
        content = `⏰ ${adminName} 的连任投票已过期，自动结束`;
        break;
    }

    return await this.sendNotification({
      guildId,
      type: 'session_end',
      content,
      isPublic: true
    });
  }

  /**
   * 发送系统状态提醒
   */
  async notifySystemStatus(
    guildId: string,
    statusMessage: string,
    isUrgent: boolean = false
  ): Promise<boolean> {
    const title = isUrgent ? '🚨 紧急提醒' : '💡 系统提醒';
    
    return await this.sendNotification({
      guildId,
      type: 'auto_trigger',
      title,
      content: statusMessage,
      isPublic: true
    });
  }

  /**
   * 批量发送通知
   */
  async sendBatchNotifications(notifications: NotificationData[]): Promise<{
    success: number;
    failed: number;
    results: boolean[];
  }> {
    const results: boolean[] = [];
    let success = 0;
    let failed = 0;

    for (const notification of notifications) {
      const result = await this.sendNotification(notification);
      results.push(result);
      
      if (result) {
        success++;
      } else {
        failed++;
      }

      // 添加小延迟避免发送过快
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return { success, failed, results };
  }

  /**
   * 格式化投票统计消息
   */
  formatVoteStatistics(statistics: Array<{
    adminName: string;
    classNumber: string;
    supportVotes: number;
    opposeVotes: number;
    totalVotes: number;
    supportRate: number;
    daysSinceAppointment: number;
    sessionStatus: string;
  }>): string {
    let message = `📊 连任投票统计\n\n`;

    for (const stat of statistics) {
      message += `👤 ${stat.adminName} (${stat.classNumber})\n`;
      message += `✅ 支持: ${stat.supportVotes}票\n`;
      message += `❌ 反对: ${stat.opposeVotes}票\n`;
      message += `📊 总票数: ${stat.totalVotes}票\n`;
      
      if (stat.totalVotes > 0) {
        message += `📈 支持率: ${stat.supportRate}%\n`;
      }
      
      message += `⏰ 任期: ${stat.daysSinceAppointment}天\n`;
      message += `📋 状态: ${stat.sessionStatus === 'ongoing' ? '进行中' : '已结束'}\n\n`;
    }

    message += `💡 使用 "支持连任 @管理员" 或 "反对连任 @管理员" 进行投票`;
    return message;
  }
}