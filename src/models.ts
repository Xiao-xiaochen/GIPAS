import { Context } from 'koishi';
import { UserRecord, ViolationRecord , FileSystem } from './type';



declare module 'koishi' {
  interface Tables {
    ViolationRecord: ViolationRecord;
    UserRecord: UserRecord;
    FileSystem: FileSystem;
  }
}

export function Database(ctx: Context) {
  ctx.model.extend('ViolationRecord', {
    id: { type: 'unsigned' },
    userId: { type: 'string', length: 255 },
    guildId: { type: 'string', length: 255 },
    timestamp: { type: 'timestamp' },
    MessageContent: { type: 'text'},
    violationLevel: { type: 'unsigned'},
    ActionDescription: { type: 'text'},
    actionTaken: { type: 'string', length: 255 },
  }, { 
    autoInc: true,
    primary: 'id' 
  });

  ctx.model.extend('UserRecord', {
    id: { type: 'unsigned' },
    userId: { type: 'string', length: 255 },
    guildId: { type: 'string', length: 255 },
    level1Violations: { type: 'unsigned', initial: 0 },
    level2Violations: { type: 'unsigned', initial: 0 },
    level3Violations: { type: 'unsigned', initial: 0 },
  }, { 
    autoInc: true,
    primary: 'id' 
  });

  ctx.model.extend( 'FileSystem' , {
    userId: { type: 'string', length: 255 },
    groupId: { type: 'string', length: 255 },
    realname: { type: 'string' },
    Term: { type: 'string' },
    Class: { type: 'string' },
    SelfDescription: { type: 'text' },
    supervisionRating: { type: 'unsigned', initial: 100 }, // 监督性评级，初始值100分
    positivityRating: { type: 'unsigned', initial: 30 }, // 积极性评分，初始值100分
    isPublic: { type: 'boolean', initial: true }, // 默认公开
  }, { 
    primary: 'userId' 
  });
}
