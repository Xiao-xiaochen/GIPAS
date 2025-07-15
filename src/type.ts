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
