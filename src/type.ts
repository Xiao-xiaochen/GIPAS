import { Context } from 'koishi'
import { Config } from './config'

export interface AnalysisContext {
  ctx: Context;
  config: Config;
  rules: string;
}

export interface MessageContent {
  text: string;
  imageUrl?: string;
}

export interface ViolationAnalysisResult {
  is_violation: boolean;
  level: 1 | 2 | 3;
  action: 'warn' | 'mute' | 'kick' | 'guild_mute' | 'none'
  muteDuration?: number;
  reason?: string;
  supervisionDeduction?: number; // AI建议的监督性评分扣除数量
  positivityDeduction?: number; // AI建议的积极性评分扣除数量
}

export interface UserRecord {
  id: number;
  userId: string;
  guildId: string;
  level1Violations: number;
  level2Violations: number;
  level3Violations: number;
};

export interface ViolationRecord {
  id: number;
  userId: string;
  guildId: string;
  timestamp: Date | number;
  MessageContent: string;
  violationLevel: number;
  ActionDescription: string;
  actionTaken: string;
};

export interface FileSystem {
  userId: string;
  groupId: string;

  realname: string;
  Term: string;
  Class: string;
  SelfDescription: string;

  supervisionRating: number; // 监督性评级，初始值100分，最高100分
  positivityRating: number; // 积极性评分，初始值100分，最高100分
  isPublic: boolean;

}

// 选举相关接口
export interface ElectionCandidate {
  id: number;
  electionId: string;
  userId: string;
  guildId: string;
  classNumber: string; // 班级编号
  candidateCode: string; // 候选人编号 (如101, 201等)
  applicationTime: Date;
  isApproved: boolean;
  manifesto?: string; // 竞选宣言
}

// 选举投票记录
export interface ElectionVote {
  id?: number;
  electionId: string;
  voterId: string;
  guildId: string;
  candidateCode: string;
  voteType: 'support' | 'oppose'; // 新增：投票类型
  voteTime: Date;
  isPublic: boolean;
}

// 连任投票记录
export interface ReelectionVote {
  id: number;
  adminUserId: string;
  guildId: string;
  voterId: string;
  isSupport: boolean;
  voteTime: Date;
}

export interface Election {
  id: number;
  electionId: string;
  guildId: string;
  electionType: 'initial' | 'reelection'; // 初选或连任选举
  status: 'preparation' | 'candidate_registration' | 'voting' | 'completed' | 'cancelled';
  startTime: Date;
  candidateRegistrationEndTime?: Date;
  votingEndTime?: Date;
  results?: string; // JSON格式存储选举结果
}

export interface Administrator {
  id: number;
  userId: string;
  guildId: string;
  classNumber: string;
  appointmentTime: Date;
  termEndTime?: Date;
  isActive: boolean;
  reelectionVotes?: number; // 连任投票数
  totalVoters?: number; // 总投票人数
}

// 弹劾记录接口
export interface ImpeachmentRecord {
  id: number;
  adminUserId: string;
  guildId: string;
  initiatorId: string;
  initiateTime: Date;
  endTime?: Date;
  status: 'ongoing' | 'success' | 'failed' | 'cancelled';
  supportVotes: number;
  opposeVotes: number;
  totalVotes: number;
  requiredVotes?: number;
  reason?: string;
  result?: string;
}
