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
