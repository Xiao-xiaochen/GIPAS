import { Context } from 'koishi';
import { Config } from '../../../config';
import * as fs from 'fs';
import * as path from 'path';
import { ThemeManager } from './ThemeManager';
import { DataNormalizer } from './DataNormalizer';
import { ChartRenderer } from './ChartRenderer';

/**
 * 图表生成器核心类
 */
export class ChartGenerator {
  private ctx: Context;
  private config: Config;
  private logger: any;
  private tempDir: string;
  private themeManager: ThemeManager;
  public dataNormalizer: DataNormalizer; // 改为公开，以便外部访问
  private chartRenderer: ChartRenderer;

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger('gipas:chart-generator');
    
    // 创建临时目录
    this.tempDir = path.join(process.cwd(), 'temp_charts');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // 初始化模块
    this.themeManager = new ThemeManager(this.logger);
    this.dataNormalizer = new DataNormalizer(this.logger);
    this.chartRenderer = new ChartRenderer(this.tempDir, this.logger);
  }

  /**
   * 生成群档案填写情况饼图
   */
  async generateProfileCompletionChart(guildId: string): Promise<string> {
    try {
      const members = await this.getGroupMembers(guildId);
      if (!members || members.length === 0) {
        throw new Error('无法获取群成员列表');
      }

      const profiles = await this.ctx.database.get('FileSystem', { groupId: guildId });
      const profileUserIds = new Set(profiles.map(p => p.userId));

      const completed = profileUserIds.size;
      const notCompleted = members.length - completed;

      return await this.chartRenderer.createModernPieChart(
        '群档案填写情况统计',
        [
          { name: '已填写', value: completed },
          { name: '未填写', value: notCompleted }
        ],
        this.themeManager.getCurrentTheme()
      );
    } catch (error) {
      this.logger.error('生成档案填写情况饼图失败:', error);
      throw error;
    }
  }

  /**
   * 生成群内届数分布饼图
   */
  async generateTermDistributionChart(guildId: string): Promise<string> {
    try {
      await this.autoCreateProfilesFromTitles(guildId);

      const profiles = await this.ctx.database.get('FileSystem', { groupId: guildId });
      if (!profiles || profiles.length === 0) {
        throw new Error('未找到任何档案数据');
      }

      // 使用数据标准化器处理数据
      const termStats = this.dataNormalizer.getTermDistribution(profiles);

      if (termStats.size === 0) {
        throw new Error('未找到有效的届数信息');
      }

      const chartData = Array.from(termStats.entries())
        .map(([term, count]) => ({ name: term, value: count }))
        .sort((a, b) => b.value - a.value);

      return await this.chartRenderer.createModernPieChart(
        '群内届数分布统计',
        chartData,
        this.themeManager.getCurrentTheme()
      );
    } catch (error) {
      this.logger.error('生成届数分布饼图失败:', error);
      throw error;
    }
  }

  /**
   * 生成群内班级分布饼图
   */
  async generateClassDistributionChart(guildId: string): Promise<string> {
    try {
      await this.autoCreateProfilesFromTitles(guildId);

      const profiles = await this.ctx.database.get('FileSystem', { groupId: guildId });
      if (!profiles || profiles.length === 0) {
        throw new Error('未找到任何档案数据');
      }

      // 使用数据标准化器处理数据
      const classStats = this.dataNormalizer.getClassDistribution(profiles);

      if (classStats.size === 0) {
        throw new Error('未找到有效的班级信息');
      }

      const chartData = Array.from(classStats.entries())
        .map(([className, count]) => ({ name: className, value: count }))
        .sort((a, b) => b.value - a.value);

      return await this.chartRenderer.createModernPieChart(
        '群内班级分布统计',
        chartData,
        this.themeManager.getCurrentTheme()
      );
    } catch (error) {
      this.logger.error('生成班级分布饼图失败:', error);
      throw error;
    }
  }

  /**
   * 批量标准化数据库中的数据格式
   */
  async normalizeProfileData(guildId: string): Promise<{ termUpdated: number, classUpdated: number }> {
    try {
      const profiles = await this.ctx.database.get('FileSystem', { groupId: guildId });
      return await this.dataNormalizer.normalizeProfileData(profiles, this.ctx.database);
    } catch (error) {
      this.logger.error('数据标准化失败:', error);
      throw error;
    }
  }

  /**
   * 为所有群成员自动建立档案（基于群头衔）
   */
  async autoCreateProfilesFromTitles(guildId: string): Promise<void> {
    try {
      const bot = this.ctx.bots.find(bot => bot.platform === 'onebot');
      if (!bot) {
        throw new Error('未找到OneBot实例');
      }

      const response = await bot.internal.getGroupMemberList(Number(guildId));
      
      for (const member of response) {
        const userId = String(member.user_id);
        const title = member.title || member.card || '';
        
        const titleInfo = this.dataNormalizer.parseTitleInfo(title);
        if (!titleInfo) {
          this.logger.debug(`跳过用户 ${userId}，无法解析头衔: ${title}`);
          continue;
        }

        const existingProfile = await this.ctx.database.get('FileSystem', { 
          userId,
          groupId: guildId 
        });

        if (existingProfile && existingProfile.length > 0) {
          const profile = existingProfile[0];
          const updates: any = {};
          
          if (!profile.Term || profile.Term.trim() === '') {
            updates.Term = titleInfo.term;
          }
          if (!profile.Class || profile.Class.trim() === '') {
            updates.Class = titleInfo.class;
          }

          if (Object.keys(updates).length > 0) {
            await this.ctx.database.set('FileSystem', { 
              userId,
              groupId: guildId 
            }, updates);
            this.logger.info(`更新用户 ${userId} 的档案信息: ${JSON.stringify(updates)}`);
          }
        } else {
          await this.ctx.database.upsert('FileSystem', [{
            userId,
            groupId: guildId,
            realname: '未填写',
            Term: titleInfo.term,
            Class: titleInfo.class,
            SelfDescription: '自动创建的档案，请完善信息',
            isPublic: true,
            supervisionRating: 100,
            positivityRating: 30
          }]);
          
          this.logger.info(`为用户 ${userId} 自动创建档案: ${titleInfo.term} ${titleInfo.class}`);
        }
      }
    } catch (error) {
      this.logger.error('自动创建档案失败:', error);
      throw error;
    }
  }

  /**
   * 获取群成员列表
   */
  private async getGroupMembers(guildId: string): Promise<string[]> {
    try {
      const bot = this.ctx.bots.find(bot => bot.platform === 'onebot');
      if (!bot) {
        throw new Error('未找到OneBot实例');
      }

      const response = await bot.internal.getGroupMemberList(Number(guildId));
      return response.map(member => String(member.user_id));
    } catch (error) {
      this.logger.error('获取群成员列表失败:', error);
      try {
        const violationRecords = await this.ctx.database.get('ViolationRecord', { guildId });
        const uniqueUsers = new Set(violationRecords.map(r => r.userId));
        this.logger.warn(`无法获取群成员列表，使用违规记录估算，发现 ${uniqueUsers.size} 个用户`);
        return Array.from(uniqueUsers);
      } catch (dbError) {
        this.logger.error('从数据库获取用户列表也失败:', dbError);
        throw new Error('无法获取群成员信息');
      }
    }
  }

  /**
   * 手动切换主题
   */
  public switchTheme(theme?: 'light' | 'dark') {
    this.themeManager.switchTheme(theme);
  }

  /**
   * 获取当前主题名称
   */
  public getCurrentThemeName(): 'light' | 'dark' {
    return this.themeManager.getCurrentThemeName();
  }

  /**
   * 获取群组的所有档案数据
   */
  public async getProfilesForGroup(guildId: string): Promise<any[]> {
    try {
      const profiles = await this.ctx.database.get('FileSystem', { groupId: guildId });
      return profiles || [];
    } catch (error) {
      this.logger.error('获取群组档案数据失败:', error);
      throw error;
    }
  }

  /**
   * 销毁资源
   */
  public dispose() {
    this.themeManager.dispose();
  }
}