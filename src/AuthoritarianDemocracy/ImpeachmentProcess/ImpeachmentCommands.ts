import { Context } from 'koishi';
import { Config } from '../../config';
import { ImpeachmentSessionManager } from './ImpeachmentSessionManager';
import { isGroupAdmin } from '../../Utils/Group/GroupAdminManagement';

export class ImpeachmentCommands {
  private sessionManager: ImpeachmentSessionManager;

  constructor(private ctx: Context, private config: Config) {
    this.sessionManager = new ImpeachmentSessionManager(ctx, config);
    this.registerCommands();
  }

  private registerCommands() {
    // 发起弹劾投票
    this.ctx.command('弹劾 <target:text>', '发起对管理员的弹劾投票')
      .option('reason', '-r <reason:text> 弹劾理由')
      .action(async ({ session, options }, target) => {
        if (!session?.guildId || !this.config.enabledGroups.includes(session.guildId)) {
          return '此功能仅在启用的群组中可用';
        }

        if (!target) {
          return '请指定要弹劾的管理员，格式：弹劾 @管理员 [-r 理由]';
        }

        // 解析目标用户ID
        const atMatch = target.match(/<at id="(\d+)"\/>/);
        const targetUserId = atMatch ? atMatch[1] : target.replace('@', '');

        if (!targetUserId) {
          return '无法识别目标用户，请使用 @用户名 格式';
        }

        const result = await this.sessionManager.initiateImpeachment(
          session.guildId,
          targetUserId,
          session.userId!,
          options?.reason
        );

        if (result.success) {
          // 发送弹劾通知
          const admin = await this.ctx.database.get('Administrator', {
            userId: targetUserId,
            guildId: session.guildId,
            isActive: true
          });

          if (admin.length > 0) {
            // 获取用户档案信息作为显示名称
            const userRecord = await this.ctx.database.get('FileSystem', {
              userId: targetUserId,
              groupId: session.guildId
            });
            const adminName = userRecord[0]?.realname || `用户${targetUserId}`;
            const message = `⚠️ 弹劾投票开始！\n\n👤 被弹劾管理员: ${adminName}\n📅 发起时间: ${new Date().toLocaleString('zh-CN')}\n📝 弹劾理由: ${options?.reason || '未提供理由'}\n\n` +
              `📊 弹劾投票规则:\n• 需要至少3票才能生效\n• 反对票数 ≥ 支持票数 = 弹劾成功，管理员卸任\n` +
              `• 支持票数 > 反对票数 = 弹劾失败，管理员继续任职\n• 只有已填写档案的成员可以投票\n• 每人只能投票一次\n\n` +
              `💡 使用 "支持连任 @${adminName}" 支持管理员留任\n💡 使用 "反对连任 @${adminName}" 支持弹劾管理员\n` +
              `💡 使用 "弹劾投票统计" 查看投票情况\n\n⚠️ 请理性投票，弹劾需要充分理由`;

            const bot = this.ctx.bots.find(bot => bot.platform === 'onebot');
            if (bot) {
              await bot.sendMessage(session.guildId, message);
            }
          }
        }

        return result.message;
      });

    // 结束弹劾投票
    this.ctx.command('结束弹劾投票 <target:text>', '结束对指定管理员的弹劾投票')
      .action(async ({ session }, target) => {
        if (!session?.guildId || !this.config.enabledGroups.includes(session.guildId)) {
          return '此功能仅在启用的群组中可用';
        }

        // 检查权限
        const isAdmin = await isGroupAdmin(this.ctx, session.guildId, session.userId!);
        if (!isAdmin) {
          return '只有管理员可以结束弹劾投票';
        }

        if (!target) {
          return '请指定管理员，格式：结束弹劾投票 @管理员';
        }

        // 解析目标用户ID
        const atMatch = target.match(/<at id="(\d+)"\/>/);
        const adminUserId = atMatch ? atMatch[1] : target.replace('@', '');

        const result = await this.sessionManager.completeImpeachment(session.guildId, adminUserId);

        // 如果弹劾成功，执行管理员卸任
        if (result.success && result.result === 'success') {
          await this.executeAdminRemoval(adminUserId, session.guildId);
        }

        return result.message;
      });

    // 弹劾投票统计
    this.ctx.command('弹劾投票统计', '查看当前弹劾投票统计')
      .action(async ({ session }) => {
        if (!session?.guildId || !this.config.enabledGroups.includes(session.guildId)) {
          return '此功能仅在启用的群组中可用';
        }

        return await this.sessionManager.getImpeachmentStats(session.guildId);
      });
  }

  // 执行管理员卸任
  private async executeAdminRemoval(adminUserId: string, guildId: string) {
    try {
      // 更新数据库中的管理员状态
      await this.ctx.database.set('Administrator', 
        { userId: adminUserId, guildId, isActive: true },
        { isActive: false, termEndTime: new Date() }
      );

      // 移除群组管理员权限
      const { setGroupAdmin } = await import('../../Utils/Group/GroupAdminManagement');
      await setGroupAdmin(this.ctx, guildId, adminUserId, false);

      this.ctx.logger('gipas:impeachment').info(`管理员 ${adminUserId} 弹劾成功，已执行卸任`);
    } catch (error) {
      this.ctx.logger('gipas:impeachment').error('执行管理员卸任时出错:', error);
    }
  }
}