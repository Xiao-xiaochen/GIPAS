/**
 * 数据标准化器
 */
export class DataNormalizer {
  private logger: any;

  constructor(logger: any) {
    this.logger = logger;
  }

  /**
   * 解析群头衔获取届数和班级信息
   */
  public parseTitleInfo(title: string): { term: string; class: string } | null {
    if (!title) return null;

    const cleanTitle = title.trim().replace(/[^\u4e00-\u9fa5\d]/g, '');
    
    // 过滤无效头衔
    const invalidPatterns = [
      /^高[一二三四五六七八九十\d]+/,
      /^初[一二三四五六七八九十\d]+/,
      /^\d{4}$/,
      /^\d{1}$/,
      /^[一二三四五六七八九十]{1}$/,
    ];

    for (const pattern of invalidPatterns) {
      if (pattern.test(cleanTitle)) {
        this.logger.debug(`过滤无效头衔: "${title}"`);
        return null;
      }
    }
    
    // 匹配各种格式
    const patterns = [
      // 中文数字格式：二八届三班
      /([一二三四五六七八九十]{2,})届([一二三四五六七八九十]+)班/,
      // 数字格式：28届3班
      /(\d{2})届(\d{1,2})班/,
      // 混合格式：二八届3班
      /([一二三四五六七八九十]{2,})届(\d{1,2})班/,
      // 混合格式：28届三班
      /(\d{2})届([一二三四五六七八九十]+)班/
    ];

    for (const pattern of patterns) {
      const match = cleanTitle.match(pattern);
      if (match) {
        const termPart = match[1];
        const classPart = match[2];
        
        // 验证届数范围（如果是数字）
        if (/^\d+$/.test(termPart)) {
          const termNumber = parseInt(termPart);
          if (termNumber < 20 || termNumber > 35) continue;
        }
        
        // 验证班级范围（如果是数字）
        if (/^\d+$/.test(classPart)) {
          const classNumber = parseInt(classPart);
          if (classNumber < 1 || classNumber > 20) continue;
        }
        
        return {
          term: termPart + '届',
          class: classPart + '班'
        };
      }
    }

    this.logger.debug(`无法解析头衔: "${title}"`);
    return null;
  }

  /**
   * 数字转简化中文数字（如28转为"二八"而非"二十八"）
   */
  private numberToChinese(num: number): string {
    const chineseNums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    
    // 对于届数，使用简化格式（如28 -> 二八）
    if (num >= 10 && num < 100) {
      const tens = Math.floor(num / 10);
      const ones = num % 10;
      return chineseNums[tens] + chineseNums[ones];
    }
    
    // 对于班级，使用单个数字（如3 -> 三）
    if (num < 10) {
      return chineseNums[num];
    }
    
    return num.toString(); // 超过范围返回原数字字符串
  }

  /**
   * 将完整中文数字转换为简化中文数字（如"二十八"转为"二八"）
   */
  private simplifyChineseNumber(text: string): string {
    // 处理十位数
    return text
      .replace(/([一二三四五六七八九])十([一二三四五六七八九])/g, '$1$2')
      .replace(/十([一二三四五六七八九])/g, '一$1')
      .replace(/([一二三四五六七八九])十/g, '$1零');
  }

  /**
   * 标准化届数格式（统一转为简化中文格式）
   */
  public normalizeTermFormat(term: string): string | null {
    if (!term || term.trim() === '' || term === '未填写') return null;
    
    const cleanTerm = term.trim();
    
    // 过滤无效数据
    if (/^\d{4}$/.test(cleanTerm)) return null; // 年份
    if (/^[一二三四五六七八九十]{1}$/.test(cleanTerm)) return null; // 单个中文数字
    if (/^\d{1}$/.test(cleanTerm)) return null; // 单个数字
    
    // 处理完整中文格式（如"二十八届"）转为简化格式（如"二八届"）
    if (/^[一二三四五六七八九十]{3,}届$/.test(cleanTerm)) {
      const termWithoutSuffix = cleanTerm.slice(0, -1); // 去掉"届"
      const simplified = this.simplifyChineseNumber(termWithoutSuffix);
      return simplified + '届';
    }
    
    // 已经是简化中文标准格式
    if (/^[一二三四五六七八九]{2}届$/.test(cleanTerm)) return cleanTerm;
    
    // 数字格式转简化中文格式（带"届"）
    if (/^\d{2}届$/.test(cleanTerm)) {
      const num = parseInt(cleanTerm);
      if (num >= 20 && num <= 35) {
        return this.numberToChinese(num) + '届';
      }
    }
    
    // 纯数字格式转简化中文格式（加"届"）
    if (/^\d{2}$/.test(cleanTerm)) {
      const num = parseInt(cleanTerm);
      if (num >= 20 && num <= 35) {
        return this.numberToChinese(num) + '届';
      }
    }
    
    // 中文格式但没有"届"
    if (/^[一二三四五六七八九十]{2,}$/.test(cleanTerm)) {
      const simplified = this.simplifyChineseNumber(cleanTerm);
      return simplified + '届';
    }
    
    return null;
  }

  /**
   * 标准化班级格式（统一转为中文格式）
   */
  public normalizeClassFormat(className: string): string | null {
    if (!className || className.trim() === '' || className === '未填写') return null;
    
    const cleanClass = className.trim();
    
    // 过滤无效格式
    if (/^高[一二三四五六七八九十\d]+/.test(cleanClass)) return null;
    if (/^初[一二三四五六七八九十\d]+/.test(cleanClass)) return null;
    if (/^\d{4}$/.test(cleanClass)) return null;
    
    // 已经是中文标准格式
    if (/^[一二三四五六七八九十]+班$/.test(cleanClass)) return cleanClass;
    
    // 数字格式转中文格式（带"班"）
    if (/^\d{1,2}班$/.test(cleanClass)) {
      const num = parseInt(cleanClass);
      if (num >= 1 && num <= 20) {
        return this.numberToChinese(num) + '班';
      }
    }
    
    // 纯数字格式转中文格式（加"班"）
    if (/^\d{1,2}$/.test(cleanClass)) {
      const num = parseInt(cleanClass);
      if (num >= 1 && num <= 20) {
        return this.numberToChinese(num) + '班';
      }
    }
    
    // 中文格式但没有"班"
    if (/^[一二三四五六七八九十]+$/.test(cleanClass)) return cleanClass + '班';
    
    return null;
  }

  /**
   * 获取届数分布统计
   */
  public getTermDistribution(profiles: any[]): Map<string, number> {
    const termStats = new Map<string, number>();
    
    profiles.forEach(profile => {
      const normalizedTerm = this.normalizeTermFormat(profile.Term);
      if (normalizedTerm) {
        termStats.set(normalizedTerm, (termStats.get(normalizedTerm) || 0) + 1);
      }
    });
    
    return termStats;
  }

  /**
   * 获取班级分布统计
   */
  public getClassDistribution(profiles: any[]): Map<string, number> {
    const classStats = new Map<string, number>();
    
    profiles.forEach(profile => {
      const normalizedClass = this.normalizeClassFormat(profile.Class);
      if (normalizedClass) {
        classStats.set(normalizedClass, (classStats.get(normalizedClass) || 0) + 1);
      }
    });
    
    return classStats;
  }

  /**
   * 批量标准化数据库中的数据格式（统一转为简化中文格式）
   */
  public async normalizeProfileData(profiles: any[], database: any): Promise<{ termUpdated: number, classUpdated: number }> {
    let termUpdated = 0;
    let classUpdated = 0;

    for (const profile of profiles) {
      const updates: any = {};
      
      // 标准化届数（转为简化中文格式）
      const normalizedTerm = this.normalizeTermFormat(profile.Term);
      if (normalizedTerm && normalizedTerm !== profile.Term) {
        // 检查是否是从完整中文格式转换为简化中文格式
        if (/^[一二三四五六七八九十]{3,}届$/.test(profile.Term)) {
          this.logger.info(`将完整中文届数 "${profile.Term}" 转换为简化格式 "${normalizedTerm}"`);
        }
        updates.Term = normalizedTerm;
        termUpdated++;
      }
      
      // 标准化班级（转为中文）
      const normalizedClass = this.normalizeClassFormat(profile.Class);
      if (normalizedClass && normalizedClass !== profile.Class) {
        updates.Class = normalizedClass;
        classUpdated++;
      }
      
      // 如果有更新，则保存
      if (Object.keys(updates).length > 0) {
        await database.set('FileSystem', { 
          userId: profile.userId,
          groupId: profile.groupId 
        }, updates);
        this.logger.info(`标准化用户 ${profile.userId} 的数据: ${JSON.stringify(updates)}`);
      }
    }

    this.logger.info(`数据标准化完成: 届数更新 ${termUpdated} 条（包括完整中文格式转简化格式），班级更新 ${classUpdated} 条`);
    return { termUpdated, classUpdated };
  }
  
  /**
   * 将已有的完整中文格式数据批量转换为简化格式
   * 专门用于处理已经转换成"二十八届"这种格式的数据
   */
  public async convertFullToSimplifiedChinese(profiles: any[], database: any): Promise<number> {
    let updated = 0;
    
    for (const profile of profiles) {
      // 只处理完整中文格式的届数
      if (profile.Term && /^[一二三四五六七八九十]{3,}届$/.test(profile.Term)) {
        const termWithoutSuffix = profile.Term.slice(0, -1); // 去掉"届"
        const simplified = this.simplifyChineseNumber(termWithoutSuffix) + '届';
        
        if (simplified !== profile.Term) {
          await database.set('FileSystem', { 
            userId: profile.userId,
            groupId: profile.groupId 
          }, { Term: simplified });
          
          this.logger.info(`将用户 ${profile.userId} 的届数从 "${profile.Term}" 转换为 "${simplified}"`);
          updated++;
        }
      }
    }
    
    this.logger.info(`完整中文格式转简化格式完成: 更新 ${updated} 条数据`);
    return updated;
  }
}