import { Context , Session } from 'koishi'
import type { OneBotBot } from 'koishi-plugin-adapter-onebot';


export function SetTitle( ctx: Context ) {
  ctx.command( '设置头衔 <targetUser:user> <newtitle:string>', { authority: 2 } )
    .action( async ( { session }, targetUser , newtitle ) => {

      if ( !session || !session.userId || !session.author || !session.guildId ) return '无法获取用户信息或无效的会话';
      if ( !targetUser ) return '请指定用户，例如：设置头衔 @张三 头衔';

      let targetUserId: string | null = null;
      if ( typeof targetUser === 'string' ) {
        const parts = targetUser.split(':');
        targetUserId = parts[parts.length - 1];
      }

      if ( !targetUserId ) {
        console.error(`无法从输入解析 targetUserId: ${targetUser}`);
        return '无法解析目标用户信息，请确保 @ 了正确的用户或提供了有效的用户ID。';
      }
      
      if ( newtitle.length > 6 ) return '头衔名过长';

      const GroupId = Number( session.guildId )
      const UserId = Number( targetUserId )

      try {

        const bot = session.bot as unknown as OneBotBot<Context>;
        await bot.internal.setGroupSpecialTitle( GroupId , UserId , newtitle );

      } catch ( error ) {
        console.error('设置头衔时出错:', error);
        return '设置头衔失败，可能是机器人权限不足或用户不存在。';
      };

    });
  ctx.logger('gipas').info('SetTitle指令注册成功');
}

