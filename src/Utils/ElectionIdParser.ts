import { Context } from 'koishi';

/**
 * 选举ID解析工具
 */
export class ElectionIdParser {
  /**
   * 解析选举ID为人类可读格式
   * @param electionId 选举ID (格式: election_群号_时间戳)
   * @returns 人类可读的选举信息
   */
  static parseElectionId(electionId: string): {
    readable: string;
    groupId: string;
    timestamp: number;
    createTime: string;
    shortId: string;
  } | null {
    try {
      const parts = electionId.split('_');
      if (parts.length !== 3 || parts[0] !== 'election') {
        return null;
      }

      const groupId = parts[1];
      const timestamp = parseInt(parts[2]);
      const createTime = new Date(timestamp).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      // 生成短ID：取时间戳后6位
      const shortId = parts[2].slice(-6);
      
      // 生成可读格式
      const readable = `${createTime.split(' ')[0].replace(/\//g, '')}期第${shortId}号选举`;

      return {
        readable,
        groupId,
        timestamp,
        createTime,
        shortId
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * 生成带解释的选举ID显示
   * @param electionId 选举ID
   * @returns 格式化的显示文本
   */
  static formatElectionDisplay(electionId: string): string {
    const parsed = this.parseElectionId(electionId);
    if (!parsed) {
      return `选举ID: ${electionId}`;
    }

    return `🏷️ 选举编号: ${parsed.readable}\n` +
           `📅 发起时间: ${parsed.createTime}\n` +
           `🔢 系统ID: ${electionId}`;
  }

  /**
   * 获取选举的简短显示名称
   * @param electionId 选举ID
   * @returns 简短名称
   */
  static getShortName(electionId: string): string {
    const parsed = this.parseElectionId(electionId);
    if (!parsed) {
      return electionId.slice(-8); // 如果解析失败，返回最后8位
    }
    return parsed.readable;
  }

  /**
   * 根据选举类型生成更友好的名称
   * @param electionId 选举ID
   * @param electionType 选举类型
   * @returns 友好的选举名称
   */
  static getFriendlyName(electionId: string, electionType: 'initial' | 'reelection'): string {
    const parsed = this.parseElectionId(electionId);
    if (!parsed) {
      return `${electionType === 'initial' ? '管理员选举' : '连任选举'} (${electionId.slice(-6)})`;
    }

    const typeText = electionType === 'initial' ? '管理员选举' : '连任选举';
    const date = parsed.createTime.split(' ')[0];
    return `${date} ${typeText} (${parsed.shortId}号)`;
  }
}

/**
 * 为选举系统添加人性化显示的辅助函数
 */
export function enhanceElectionDisplay(ctx: Context) {
  const logger = ctx.logger('gipas:election-display');

  // 添加选举ID解析命令
  ctx.command('解析选举ID <electionId:string>')
    .action(async ({ session }, electionId) => {
      if (!electionId) {
        return '❌ 请提供选举ID\n💡 使用格式: 解析选举ID election_群号_时间戳';
      }

      const parsed = ElectionIdParser.parseElectionId(electionId);
      if (!parsed) {
        return '❌ 选举ID格式不正确';
      }

      let message = `🔍 选举ID解析结果\n\n`;
      message += `📋 友好名称: ${parsed.readable}\n`;
      message += `🏫 群组ID: ${parsed.groupId}\n`;
      message += `📅 创建时间: ${parsed.createTime}\n`;
      message += `🔢 短编号: ${parsed.shortId}\n`;
      message += `⏰ 时间戳: ${parsed.timestamp}\n\n`;
      message += `💡 以后可以用 "${parsed.readable}" 来称呼这次选举`;

      return message;
    });

  // 添加当前选举简称查看命令
  ctx.command('当前选举')
    .action(async ({ session }) => {
      if (!session?.guildId) {
        return '请在群聊中使用此命令';
      }

      try {
        const elections = await ctx.database.get('Election', {
          guildId: session.guildId
        });

        const ongoingElections = elections.filter(e => 
          e.status === 'preparation' || 
          e.status === 'candidate_registration' || 
          e.status === 'voting'
        );

        if (ongoingElections.length === 0) {
          return '📊 当前没有进行中的选举';
        }

        let message = `📊 当前进行中的选举\n\n`;

        for (const election of ongoingElections) {
          const friendlyName = ElectionIdParser.getFriendlyName(election.electionId, election.electionType);
          const statusText = getStatusText(election.status);
          
          message += `🗳️ ${friendlyName}\n`;
          message += `📍 状态: ${statusText}\n`;
          
          if (election.candidateRegistrationEndTime) {
            message += `⏰ 报名截止: ${new Date(election.candidateRegistrationEndTime).toLocaleString('zh-CN')}\n`;
          }
          if (election.votingEndTime) {
            message += `🗳️ 投票截止: ${new Date(election.votingEndTime).toLocaleString('zh-CN')}\n`;
          }
          message += '\n';
        }

        return message;

      } catch (error) {
        logger.error('查看当前选举失败:', error);
        return '❌ 查看当前选举失败';
      }
    });

  logger.info('选举ID人性化显示功能已加载');
}

// 获取状态文本的辅助函数
function getStatusText(status: string): string {
  switch (status) {
    case 'preparation': return '准备中';
    case 'candidate_registration': return '候选人报名中';
    case 'voting': return '投票中';
    case 'completed': return '已完成';
    case 'cancelled': return '已取消';
    default: return '未知状态';
  }
}