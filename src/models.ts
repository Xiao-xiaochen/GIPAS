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
    userId: { type: 'string' },
    groupId: { type: 'string' },
    realname: { type: 'string' },
    Netname: { type: 'string' },
    Term: { type: 'string' },
    Class: { type: 'string' },
    SelfDescription: { type: 'text' },
    GroupSupervisoryRating: { type: 'unsigned', initial: 0 },
    isPublic: { type: 'boolean', initial: false },
  }, { 
    primary: 'userId' 
  });
}
