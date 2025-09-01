import { Context } from 'koishi';
import { GoogleGenAI, Content } from "@google/genai";
import { Config } from '../../config';

export interface AIResponse {
  text: string;
  success: boolean;
  provider: 'gemini' | 'deepseek';
  error?: string;
}

export class AIServiceManager {
  private ctx: Context;
  private config: Config;
  private logger: any;

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger('gipas:ai-service');
  }

  /**
   * 调用Gemini API
   */
  private async callGemini(contents: Content[], useStream: boolean = false): Promise<AIResponse> {
    try {
      if (!this.config.geminiApiKey) {
        return {
          text: '',
          success: false,
          provider: 'gemini',
          error: 'Gemini API Key 未配置'
        };
      }

      const genAI = new GoogleGenAI({ apiKey: this.config.geminiApiKey });

      if (useStream) {
        const streamResponse = await genAI.models.generateContentStream({
          model: this.config.geminiModel,
          contents: contents
        });

        let fullResponseText = '';
        for await (const chunk of streamResponse) {
          fullResponseText += chunk.text;
        }

        return {
          text: fullResponseText.trim(),
          success: true,
          provider: 'gemini'
        };
      } else {
        const result = await genAI.models.generateContent({
          model: this.config.geminiModel,
          contents: contents
        });

        return {
          text: result.text?.trim() ?? '',
          success: true,
          provider: 'gemini'
        };
      }
    } catch (error) {
      // 只在调试模式下记录详细错误，减少日志噪音
      if (error.status === 429) {
        this.logger.warn('Gemini API 配额已用完，准备切换到备用服务');
      } else {
        this.logger.debug('Gemini API 调用失败:', error.message);
      }
      
      return {
        text: '',
        success: false,
        provider: 'gemini',
        error: error.message || 'Gemini API 调用失败'
      };
    }
  }

  /**
   * 调用Deepseek API
   */
  private async callDeepseek(contents: Content[]): Promise<AIResponse> {
    try {
      if (!this.config.deepseekApiKey) {
        return {
          text: '',
          success: false,
          provider: 'deepseek',
          error: 'Deepseek API Key 未配置'
        };
      }

      // 检查是否包含图片内容
      const hasImage = contents.some(content => 
        content.parts.some(part => 'inlineData' in part)
      );

      if (hasImage) {
        return {
          text: '',
          success: false,
          provider: 'deepseek',
          error: 'Deepseek 不支持图片分析'
        };
      }

      // 转换消息格式为OpenAI兼容格式
      const messages = contents.map(content => ({
        role: content.role === 'user' ? 'user' : 'assistant',
        content: content.parts.map(part => {
          if ('text' in part) {
            return part.text;
          }
          return '';
        }).join('\n')
      }));

      const response = await fetch(`${this.config.deepseekBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.deepseekApiKey}`
        },
        body: JSON.stringify({
          model: this.config.deepseekModel,
          messages: messages,
          temperature: 0.1,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.debug(`Deepseek API 错误 (${response.status}): ${errorData}`);
        return {
          text: '',
          success: false,
          provider: 'deepseek',
          error: `API错误 ${response.status}`
        };
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';

      return {
        text: text.toLowerCase().trim(),
        success: true,
        provider: 'deepseek'
      };
    } catch (error) {
      this.logger.debug('Deepseek API 调用失败:', error.message);
      return {
        text: '',
        success: false,
        provider: 'deepseek',
        error: error.message || 'Deepseek API 调用失败'
      };
    }
  }

  /**
   * 根据策略调用AI服务
   */
  async generateContent(contents: Content[], useStream: boolean = false): Promise<AIResponse> {
    const strategy = this.config.apiStrategy;
    
    // 检查是否包含图片
    const hasImage = contents.some(content => 
      content.parts.some(part => 'inlineData' in part)
    );

    switch (strategy) {
      case 'gemini-only':
        return await this.callGemini(contents, useStream);

      case 'deepseek-only':
        if (hasImage) {
          this.logger.warn('Deepseek 不支持图片分析，但配置为仅使用 Deepseek');
          return {
            text: '',
            success: false,
            provider: 'deepseek',
            error: 'Deepseek 不支持图片分析'
          };
        }
        return await this.callDeepseek(contents);

      case 'gemini-first':
        const geminiResult = await this.callGemini(contents, useStream);
        if (geminiResult.success) {
          return geminiResult;
        }
        
        // 如果包含图片，不要切换到 Deepseek
        if (hasImage) {
          this.logger.warn('Gemini 调用失败且消息包含图片，Deepseek 无法处理');
          return geminiResult; // 返回 Gemini 的错误结果
        }
        
        this.logger.info('Gemini 调用失败，切换到 Deepseek');
        return await this.callDeepseek(contents);

      case 'deepseek-first':
        // 如果包含图片，直接使用 Gemini
        if (hasImage) {
          this.logger.info('消息包含图片，直接使用 Gemini');
          return await this.callGemini(contents, useStream);
        }
        
        const deepseekResult = await this.callDeepseek(contents);
        if (deepseekResult.success) {
          return deepseekResult;
        }
        
        this.logger.info('Deepseek 调用失败，切换到 Gemini');
        return await this.callGemini(contents, useStream);

      default:
        this.logger.error('未知的 API 策略:', strategy);
        return {
          text: '',
          success: false,
          provider: 'gemini',
          error: '未知的 API 策略'
        };
    }
  }

  /**
   * 获取可用的Gemini模型列表
   */
  async getAvailableGeminiModels(): Promise<string[]> {
    try {
      if (!this.config.geminiApiKey) {
        this.logger.warn('Gemini API Key 未配置，无法获取模型列表');
        return [];
      }

      const genAI = new GoogleGenAI({ apiKey: this.config.geminiApiKey });
      
      // 尝试获取模型列表
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.config.geminiApiKey}`);
      
      if (!response.ok) {
        this.logger.warn(`获取Gemini模型列表失败: ${response.status}`);
        return this.getFallbackGeminiModels();
      }

      const data = await response.json();
      const models = data.models
        ?.filter((model: any) => model.name.includes('gemini'))
        ?.map((model: any) => model.name.replace('models/', ''))
        ?.sort() || [];

      this.logger.info(`成功获取 ${models.length} 个Gemini模型`);
      return models.length > 0 ? models : this.getFallbackGeminiModels();

    } catch (error) {
      this.logger.warn('获取Gemini模型列表时出错:', error.message);
      return this.getFallbackGeminiModels();
    }
  }

  /**
   * 获取备用的Gemini模型列表
   */
  private getFallbackGeminiModels(): string[] {
    return [
      'gemini-2.0-flash-exp',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
      'gemini-1.0-pro'
    ];
  }

  /**
   * 测试模型是否可用
   */
  async testModel(modelName: string): Promise<boolean> {
    try {
      const originalModel = this.config.geminiModel;
      this.config.geminiModel = modelName;

      const testContents: Content[] = [{
        role: 'user',
        parts: [{ text: 'test' }]
      }];

      const result = await this.callGemini(testContents);
      
      // 恢复原始模型
      this.config.geminiModel = originalModel;
      
      return result.success;
    } catch (error) {
      this.logger.debug(`模型 ${modelName} 测试失败:`, error.message);
      return false;
    }
  }

  /**
   * 检查API可用性
   */
  async checkAPIStatus(): Promise<{
    gemini: boolean;
    deepseek: boolean;
    errors: string[];
    availableGeminiModels?: string[];
  }> {
    const errors: string[] = [];
    let geminiAvailable = false;
    let deepseekAvailable = false;
    let availableGeminiModels: string[] = [];

    // 测试 Gemini
    if (this.config.geminiApiKey) {
      try {
        const testContents: Content[] = [{
          role: 'user',
          parts: [{ text: 'test' }]
        }];
        const result = await this.callGemini(testContents);
        geminiAvailable = result.success;
        if (!result.success) {
          errors.push(`Gemini: ${result.error}`);
        } else {
          // 如果Gemini可用，获取模型列表
          availableGeminiModels = await this.getAvailableGeminiModels();
        }
      } catch (error) {
        errors.push(`Gemini: ${error.message}`);
      }
    } else {
      errors.push('Gemini: API Key 未配置');
    }

    // 测试 Deepseek
    if (this.config.deepseekApiKey) {
      try {
        const testContents: Content[] = [{
          role: 'user',
          parts: [{ text: 'test' }]
        }];
        const result = await this.callDeepseek(testContents);
        deepseekAvailable = result.success;
        if (!result.success) {
          errors.push(`Deepseek: ${result.error}`);
        }
      } catch (error) {
        errors.push(`Deepseek: ${error.message}`);
      }
    } else {
      errors.push('Deepseek: API Key 未配置');
    }

    return {
      gemini: geminiAvailable,
      deepseek: deepseekAvailable,
      errors,
      availableGeminiModels
    };
  }
}