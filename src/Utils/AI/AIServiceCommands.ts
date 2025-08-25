import { Context } from 'koishi';
import { Config } from '../../config';
import { AIServiceManager } from './AIServiceManager';

export function addAIServiceCommands(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:ai-commands');

  // AI服务状态检查命令
  ctx.command('AI状态', { authority: 3 })
    .action(async ({ session }) => {
      if (!session) {
        return '无效的会话';
      }

      try {
        const aiService = new AIServiceManager(ctx, config);
        const status = await aiService.checkAPIStatus();

        let message = `🤖 AI服务状态检查\n\n`;
        message += `📊 当前策略: ${getStrategyDescription(config.apiStrategy)}\n\n`;
        
        // Gemini 状态
        message += `🔵 Gemini API: ${status.gemini ? '✅ 可用' : '❌ 不可用'}\n`;
        if (config.geminiApiKey) {
          message += `   模型: ${config.geminiModel}\n`;
        } else {
          message += `   ⚠️ API Key 未配置\n`;
        }
        
        // Deepseek 状态
        message += `🟡 Deepseek API: ${status.deepseek ? '✅ 可用' : '❌ 不可用'}\n`;
        if (config.deepseekApiKey) {
          message += `   模型: ${config.deepseekModel}\n`;
          message += `   地址: ${config.deepseekBaseUrl}\n`;
        } else {
          message += `   ⚠️ API Key 未配置\n`;
        }

        // 错误信息
        if (status.errors.length > 0) {
          message += `\n❌ 错误详情:\n`;
          for (const error of status.errors) {
            message += `• ${error}\n`;
          }
        }

        // 建议
        if (!status.gemini && !status.deepseek) {
          message += `\n⚠️ 所有AI服务都不可用，请检查配置！`;
        } else if (config.apiStrategy === 'gemini-only' && !status.gemini) {
          message += `\n💡 建议切换到 deepseek-only 或 deepseek-first 策略`;
        } else if (config.apiStrategy === 'deepseek-only' && !status.deepseek) {
          message += `\n💡 建议切换到 gemini-only 或 gemini-first 策略`;
        }

        return message;

      } catch (error) {
        logger.error('检查AI服务状态失败:', error);
        return '❌ 检查AI服务状态失败，请查看日志';
      }
    });

  // AI服务测试命令
  ctx.command('测试AI <message:text>', { authority: 4 })
    .action(async ({ session }, message) => {
      if (!session || !message) {
        return '请提供测试消息';
      }

      try {
        const aiService = new AIServiceManager(ctx, config);
        const testContents = [{
          role: 'user' as const,
          parts: [{ text: `测试消息: ${message}` }]
        }];

        const result = await aiService.generateContent(testContents);

        if (result.success) {
          return `✅ AI测试成功 (${result.provider})\n回复: ${result.text}`;
        } else {
          return `❌ AI测试失败 (${result.provider})\n错误: ${result.error}`;
        }

      } catch (error) {
        logger.error('AI服务测试失败:', error);
        return '❌ AI服务测试失败，请查看日志';
      }
    });

  // 获取可用模型列表命令
  ctx.command('获取AI模型', { authority: 4 })
    .action(async ({ session }) => {
      if (!session) {
        return '无效的会话';
      }

      try {
        const aiService = new AIServiceManager(ctx, config);
        
        let message = `🤖 AI模型信息\n\n`;
        message += `📋 当前使用模型: ${config.geminiModel}\n\n`;

        // 获取可用的Gemini模型
        message += `🔍 正在获取可用的Gemini模型...\n`;
        const availableModels = await aiService.getAvailableGeminiModels();
        
        if (availableModels.length > 0) {
          message += `\n✅ 发现 ${availableModels.length} 个可用模型:\n`;
          for (const model of availableModels) {
            const isCurrent = model === config.geminiModel;
            message += `${isCurrent ? '🔸' : '•'} ${model}${isCurrent ? ' (当前)' : ''}\n`;
          }
          
          message += `\n💡 使用 "测试模型 <模型名>" 来测试特定模型`;
          message += `\n💡 在配置中修改 geminiModel 来切换模型`;
        } else {
          message += `\n❌ 无法获取模型列表，请检查API配置`;
        }

        return message;

      } catch (error) {
        logger.error('获取AI模型列表失败:', error);
        return '❌ 获取AI模型列表失败，请查看日志';
      }
    });

  // 测试特定模型命令
  ctx.command('测试模型 <modelName:string>', { authority: 4 })
    .action(async ({ session }, modelName) => {
      if (!session || !modelName) {
        return '请提供模型名称';
      }

      try {
        const aiService = new AIServiceManager(ctx, config);
        
        let message = `🧪 测试模型: ${modelName}\n\n`;
        message += `⏳ 正在测试模型可用性...\n`;

        const isAvailable = await aiService.testModel(modelName);
        
        if (isAvailable) {
          message += `✅ 模型 ${modelName} 可用\n`;
          message += `💡 可以在配置中将 geminiModel 设置为 "${modelName}"`;
        } else {
          message += `❌ 模型 ${modelName} 不可用或测试失败\n`;
          message += `💡 请检查模型名称是否正确，或使用 "获取AI模型" 查看可用模型`;
        }

        return message;

      } catch (error) {
        logger.error('测试AI模型失败:', error);
        return '❌ 测试AI模型失败，请查看日志';
      }
    });

  logger.info('AI服务管理命令已加载');
}

function getStrategyDescription(strategy: string): string {
  switch (strategy) {
    case 'gemini-only':
      return '仅使用 Gemini';
    case 'deepseek-only':
      return '仅使用 Deepseek';
    case 'gemini-first':
      return '优先 Gemini，失败时切换到 Deepseek';
    case 'deepseek-first':
      return '优先 Deepseek，失败时切换到 Gemini';
    default:
      return '未知策略';
  }
}