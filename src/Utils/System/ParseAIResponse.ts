import { Context } from 'koishi'
import { Config } from '../config'
import { ViolationAnalysisResult } from '../type'



// 解析AI的响应
export function ParseAIResponse(predictionText: string, config: Config, ctx: Context): ViolationAnalysisResult {
  // 清理AI响应，移除多余的空白字符和换行符
  const cleanedText = predictionText.trim().replace(/\n/g, '').replace(/\r/g, '');
  const parts = cleanedText.split(',').map(part => part.trim());

  const level1Action = config.level1Action;

  // 检查是否违规
  const isViolation = parts[0].toLowerCase() === 'true';
  if (!isViolation) {
    ctx.logger('gipas').debug(`AI判定不违规，原始响应: "${predictionText}", 清理后: "${cleanedText}", 第一部分: "${parts[0]}"`);
    return {
      is_violation: false,
      level: 1,
      action: 'warn'
    };
  }

  // 违规情况下，检查格式完整性
  if (parts.length < 2) {
    ctx.logger('gipas').warn('AI响应格式无效 (缺少等级):', cleanedText);
    return { is_violation: true, level: 1, action: level1Action, reason: 'AI响应格式错误，已默认为1级违规。' };
  }

  const level = parseInt(parts[1], 10) as (1 | 2 | 3);
  if (isNaN(level) || level < 1 || level > 3) {
    ctx.logger('gipas').warn('AI返回了无效的违规等级:', parts[1]);
    return { is_violation: true, level: 1, action: level1Action, reason: `AI返回无效等级 (${parts[1]})，已默认为1级违规。` };
  }

  const actionStr = parts[2]?.toLowerCase();
  const durationStr = parts[3]?.toLowerCase();
  const reason = parts.length > 4 ? parts[4].trim() : `AI判定违规 (等级 ${level})`;
  const supervisionDeduction = parts.length > 5 ? parseInt(parts[5], 10) : undefined;
  const positivityDeduction = parts.length > 6 ? parseInt(parts[6], 10) : undefined;

  let action: ViolationAnalysisResult['action'] = level1Action
  let muteDuration: number | undefined;

  switch (actionStr) {
    case 'kick': action = 'kick'; break;
    case 'warn': action = 'warn'; break;
    case 'mute':
      action = 'mute';
      const duration = parseInt(durationStr, 10);
      if (!isNaN(duration) && duration > 0) {
        muteDuration = duration; // AI直接提供秒
      }
      break;
    case 'none': action = 'none'; break;
  }

  // 如果AI未提供有效操作，则根据配置回退
  if ( !action ) {
    switch (level) {
      case 1:
        action = level1Action;
        if ( action === 'mute' ) muteDuration = config.level1MuteMinutes * 60;
        break;
      case 2:
        action = config.level2Action;
        if (action === 'mute') muteDuration = config.level2MuteMinutes * 60;
        break;
      case 3:
        action = config.level3Action;
        if (action === 'mute') muteDuration = config.level3MuteMinutes * 60;
        break;
    }
  }
  
  return { 
    is_violation: true, 
    level, 
    action, 
    muteDuration, 
    reason,
    supervisionDeduction: supervisionDeduction && !isNaN(supervisionDeduction) ? supervisionDeduction : undefined,
    positivityDeduction: positivityDeduction && !isNaN(positivityDeduction) ? positivityDeduction : undefined
  };
}