import { Context } from 'koishi';

const WaitingTime: Record<string, number> = {};
const ClearTimeout = 30 * 1000; // 确认超时时间：30秒

export function ClearReset(ctx: Context) {
  ctx.command('重置数据', { authority: 4 }) // 设置权限等级为4
    .action(async ({ session }) => {
      if (!session || !session.userId || !session.author) {
        return '无法获取用户信息。';
      }

      const userId = session.userId;
      const username = session.author.name || '未知用户';
      const now = Date.now();

      // 检查是否有待确认的请求且未超时
      if ( WaitingTime[userId] && (now - WaitingTime[userId] < ClearTimeout)) {
        try {
          console.log(`用户 ${username} (${userId}) 确认重置国家数据。`);

          // 清空数据库中的违规数据
          const removedCount = await ctx.database.remove('UserRecord', {});
          console.log(`已从数据库删除 ${removedCount} 条国家数据。`);

          // 清除确认状态
          delete WaitingTime[userId];

          return `
=====[数据管理]=====
G.I.P.A.S.
所有违规数据已被重置！
`.trim();

        } catch (error) {
          console.error('重置违规数据时出错:', error);
          delete WaitingTime[userId];
        }

      } else {
        // --- 请求用户确认 ---
        WaitingTime[userId] = now;

        // 设置超时自动清除确认状态，并发送提示
        setTimeout(() => {
          // 检查是否是同一次请求并且仍然存在
          if ( WaitingTime[userId] === now) {
            delete WaitingTime[userId];
            // 尝试发送超时提示 (如果会话仍然有效)
            session.send(`=====[确认操作]=====\n违规数据重置操作已超时, 重置取消！`).catch(err => {
              console.warn(`发送违规数据重置超时消息失败: ${err.message}`);
            });
            console.log(`用户 ${username} (${userId}) 的违规数据重置确认已超时。`);
          }
        }, ClearTimeout );

        return `
=====[确认操作]=====
G.I.P.A.S. 警告：
此操作将清除所有违规数据！
请在 ${ ClearTimeout / 1000} 秒内再次输入 :
'重置数据' 命令以确认。
`.trim();
      }
    });
}