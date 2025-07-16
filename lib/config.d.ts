import { Schema } from 'koishi';
export interface Config {
    geminiModel: string;
    geminiApiKey: string;
    MonitoredGuildIds: string[];
    MaxChatHistoryLength: number;
    Rules: string;
    level1Action: 'warn' | 'mute' | 'kick' | 'guild_mute' | 'none';
    level2Action: 'warn' | 'mute' | 'kick' | 'guild_mute' | 'none';
    level3Action: 'warn' | 'mute' | 'kick' | 'guild_mute' | 'none';
    level1MuteMinutes: number;
    level2MuteMinutes: number;
    level3MuteMinutes: number;
}
export declare const Config: Schema<Config>;
