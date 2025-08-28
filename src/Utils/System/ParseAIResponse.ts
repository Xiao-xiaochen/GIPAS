import { Context } from 'koishi';
import { Config } from '../../config';
import { ViolationAnalysisResult } from '../../type';

export function ParseAIResponse(
    predictionText: string,
    config: Config,
    ctx: Context
): ViolationAnalysisResult {
    const DefaultResult: ViolationAnalysisResult = {
        is_violation: false,
        level: 1,
        action: 'warn'
    };

    try {
        // 清理回复文本
        const cleanText = predictionText.trim().replace(/```.*?```/gs, '').replace(/`/g, '');
        
        // 如果回复是 "false"，直接返回不违规
        if (cleanText.toLowerCase() === 'false') {
            return DefaultResult;
        }

        // 解析违规回复格式: "true,违规等级,处罚建议,处罚时长,原因,监督性扣分,积极性扣分"
        const parts = cleanText.split(',');
        
        if (parts.length < 2 || parts[0].toLowerCase() !== 'true') {
            ctx.logger('gipas').warn(`AI回复格式错误: ${predictionText}`);
            return DefaultResult;
        }

        // 解析违规等级 - 支持中文和数字格式
        let level: 1 | 2 | 3 = 1;
        const levelText = parts[1].trim();
        
        // 中文违规等级映射
        const levelMap: { [key: string]: 1 | 2 | 3 } = {
            '一级违规': 1,
            '二级违规': 2,
            '三级违规': 3,
            '轻微违规': 1,
            '中等违规': 2,
            '严重违规': 3,
            '1级违规': 1,
            '2级违规': 2,
            '3级违规': 3
        };

        if (levelMap[levelText]) {
            level = levelMap[levelText];
        } else {
            // 尝试解析数字
            const numLevel = parseInt(levelText);
            if (!isNaN(numLevel) && numLevel >= 1 && numLevel <= 3) {
                level = numLevel as (1 | 2 | 3);
            } else {
                // 如果AI返回了无效格式（如"违规等级"），根据处罚类型推断等级
                ctx.logger('gipas').warn(`AI返回了无效的违规等级: ${levelText}`);
                
                // 根据处罚建议推断违规等级
                const actionText = parts[2]?.trim().toLowerCase();
                if (actionText === 'kick') {
                    level = 3; // 踢出通常是严重违规
                } else if (actionText === 'mute' || actionText === 'guild_mute') {
                    level = 2; // 禁言通常是中等违规
                } else {
                    level = 1; // 警告通常是轻微违规
                }
                
                ctx.logger('gipas').info(`根据处罚类型 ${actionText} 推断违规等级为: ${level}`);
            }
        }

        // 解析处罚建议
        let action: 'warn' | 'mute' | 'kick' | 'guild_mute' | 'none' = 'warn';
        if (parts.length > 2) {
            const actionText = parts[2].trim().toLowerCase();
            if (['warn', 'mute', 'kick', 'guild_mute', 'none'].includes(actionText)) {
                action = actionText as 'warn' | 'mute' | 'kick' | 'guild_mute' | 'none';
            }
        }

        // 解析处罚时长
        let muteDuration: number | undefined;
        if (parts.length > 3 && (action === 'mute' || action === 'guild_mute')) {
            const durationText = parts[3].trim();
            const parsedDuration = parseInt(durationText);
            if (!isNaN(parsedDuration) && parsedDuration > 0) {
                muteDuration = parsedDuration;
            }
        }

        // 解析原因 - 过滤无效的原因文本
        let reason = '违规行为';
        if (parts.length > 4) {
            const reasonText = parts[4].trim();
            // 过滤掉无效的原因文本
            const invalidReasons = ['原因', '违规原因', 'reason', ''];
            if (!invalidReasons.includes(reasonText) && reasonText.length > 2) {
                reason = reasonText;
            } else {
                // 如果原因无效，根据违规等级提供默认原因
                switch (level) {
                    case 1:
                        reason = '轻微违规行为';
                        break;
                    case 2:
                        reason = '中等违规行为';
                        break;
                    case 3:
                        reason = '严重违规行为';
                        break;
                    default:
                        reason = '违规行为';
                }
            }
        }

        // 解析扣分 - 处理AI可能返回的各种格式
        let supervisionDeduction = 5;
        let activityDeduction = 2;
        
        // 寻找监督性扣分
        for (let i = 5; i < parts.length; i++) {
            const part = parts[i].trim();
            const score = parseInt(part);
            if (!isNaN(score) && score > 0) {
                if (i === 5 || parts[i-1]?.includes('监督')) {
                    supervisionDeduction = score;
                    break;
                }
            }
        }
        
        // 寻找积极性扣分
        for (let i = 6; i < parts.length; i++) {
            const part = parts[i].trim();
            const score = parseInt(part);
            if (!isNaN(score) && score > 0) {
                if (parts[i-1]?.includes('积极') || i === parts.length - 1) {
                    activityDeduction = score;
                    break;
                }
            }
        }

        const result: ViolationAnalysisResult = {
            is_violation: true,
            level,
            action,
            muteDuration,
            reason,
            supervisionDeduction,
            positivityDeduction: activityDeduction
        };

        ctx.logger('gipas').debug(`解析AI回复成功: ${JSON.stringify(result)}`);
        return result;

    } catch (error) {
        ctx.logger('gipas').error(`解析AI回复时发生错误: ${error}`);
        ctx.logger('gipas').error(`原始回复: ${predictionText}`);
        return DefaultResult;
    }
}