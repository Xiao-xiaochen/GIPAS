import { Context } from 'koishi';
import { UserRecord, ViolationRecord, FileSystem, ElectionCandidate, ElectionVote, Election, Administrator, ReelectionVote } from './type';



declare module 'koishi' {
  interface Tables {
    ViolationRecord: ViolationRecord;
    UserRecord: UserRecord;
    FileSystem: FileSystem;
    ElectionCandidate: ElectionCandidate;
    ElectionVote: ElectionVote;
    Election: Election;
    Administrator: Administrator;
    ReelectionVote: ReelectionVote;
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

  // 选举候选人表
  ctx.model.extend('ElectionCandidate', {
    id: { type: 'unsigned' },
    electionId: { type: 'string', length: 255 },
    userId: { type: 'string', length: 255 },
    guildId: { type: 'string', length: 255 },
    classNumber: { type: 'string', length: 10 },
    candidateCode: { type: 'string', length: 10 },
    applicationTime: { type: 'timestamp' },
    isApproved: { type: 'boolean', initial: false },
    manifesto: { type: 'text' }
  }, {
    autoInc: true,
    primary: 'id'
  });

  // 选举投票表
  ctx.model.extend('ElectionVote', {
    id: { type: 'unsigned' },
    electionId: { type: 'string', length: 255 },
    voterId: { type: 'string', length: 255 },
    guildId: { type: 'string', length: 255 },
    candidateCode: { type: 'string', length: 10 },
    voteType: { type: 'string', length: 10 }, // 新增：投票类型 'support' 或 'oppose'
    voteTime: { type: 'timestamp' },
    isPublic: { type: 'boolean', initial: true }
  }, {
    primary: 'id',
    autoInc: true
  });

  // 连任投票表
  ctx.model.extend('ReelectionVote', {
    id: { type: 'unsigned' },
    adminUserId: { type: 'string', length: 255 },
    guildId: { type: 'string', length: 255 },
    voterId: { type: 'string', length: 255 },
    isSupport: { type: 'boolean' },
    voteTime: { type: 'timestamp' }
  }, {
    primary: 'id',
    autoInc: true
  });

  // 选举表
  ctx.model.extend('Election', {
    id: { type: 'unsigned' },
    electionId: { type: 'string', length: 255 },
    guildId: { type: 'string', length: 255 },
    electionType: { type: 'string', length: 50 },
    status: { type: 'string', length: 50 },
    startTime: { type: 'timestamp' },
    candidateRegistrationEndTime: { type: 'timestamp' },
    votingEndTime: { type: 'timestamp' },
    results: { type: 'text' }
  }, {
    autoInc: true,
    primary: 'id'
  });

  // 管理员表
  ctx.model.extend('Administrator', {
    id: { type: 'unsigned' },
    userId: { type: 'string', length: 255 },
    guildId: { type: 'string', length: 255 },
    classNumber: { type: 'string', length: 10 },
    appointmentTime: { type: 'timestamp' },
    termEndTime: { type: 'timestamp' },
    isActive: { type: 'boolean', initial: true },
    reelectionVotes: { type: 'unsigned', initial: 0 },
    totalVoters: { type: 'unsigned', initial: 0 }
  }, {
    autoInc: true,
    primary: 'id'
  });
}
