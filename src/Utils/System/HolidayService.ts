import { Context } from 'koishi';
import { Config } from '../../config';

export interface HolidayInfo {
  year: number;
  festival: string;
  start_time: string;
  end_time: string;
  days: number;
  weekday: string; // 调休日期，多个逗号分隔
}

export interface HolidayApiResponse {
  status: boolean;
  code: number;
  message: string;
  data: HolidayInfo[];
  request_id: string;
}

export type DateType = 'workday' | 'holiday' | 'weekend' | 'makeup_workday';

export class HolidayService {
  private cache: Map<number, HolidayInfo[]> = new Map();
  private lastUpdate: Map<number, Date> = new Map();
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时缓存

  constructor(
    private ctx: Context,
    private config: Config
  ) {}

  /**
   * 判断指定日期是否为工作日
   */
  async isWorkday(date: string): Promise<boolean> {
    const dateType = await this.getDateType(date);
    return dateType === 'workday' || dateType === 'makeup_workday';
  }

  /**
   * 判断指定日期是否为节假日
   */
  async isHoliday(date: string): Promise<boolean> {
    const dateType = await this.getDateType(date);
    return dateType === 'holiday';
  }

  /**
   * 获取指定日期的类型
   */
  async getDateType(date: string): Promise<DateType> {
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const dayOfWeek = dateObj.getDay(); // 0=周日, 1=周一, ..., 6=周六

    try {
      // 获取该年的节假日数据
      const holidayData = await this.getHolidayData(year);
      
      // 检查是否在节假日期间
      for (const holiday of holidayData) {
        const startDate = new Date(holiday.start_time);
        const endDate = new Date(holiday.end_time);
        
        if (dateObj >= startDate && dateObj <= endDate) {
          return 'holiday';
        }
        
        // 检查是否为调休工作日
        if (holiday.weekday) {
          const makeupDays = holiday.weekday.split(',').map(d => d.trim());
          if (makeupDays.includes(date)) {
            return 'makeup_workday';
          }
        }
      }
      
      // 如果不是节假日或调休日，判断是否为周末
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return 'weekend';
      }
      
      // 其他情况为工作日
      return 'workday';
      
    } catch (error) {
      this.ctx.logger('holiday-service').warn(`获取节假日数据失败，使用默认判断: ${error.message}`);
      
      // 降级处理：只根据星期判断
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return 'weekend';
      }
      return 'workday';
    }
  }

  /**
   * 获取指定年份的节假日数据
   */
  async getHolidayData(year: number): Promise<HolidayInfo[]> {
    // 检查缓存
    const cached = this.cache.get(year);
    const lastUpdate = this.lastUpdate.get(year);
    
    if (cached && lastUpdate && (Date.now() - lastUpdate.getTime()) < this.CACHE_DURATION) {
      return cached;
    }

    // 从API获取数据
    const data = await this.fetchHolidayFromAPI(year);
    
    // 更新缓存
    this.cache.set(year, data);
    this.lastUpdate.set(year, new Date());
    
    return data;
  }

  /**
   * 从API获取节假日数据
   */
  private async fetchHolidayFromAPI(year: number): Promise<HolidayInfo[]> {
    if (!this.config.holidayApiClientId || !this.config.holidayApiSecret) {
      throw new Error('节假日API配置不完整');
    }

    const url = `https://www.idcd.com/api/holiday?year=${year}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = this.generateNonce();
    const signatureMethod = 'HmacSHA256';
    
    // 按照官方文档生成签名
    const signature = await this.generateSignature(
      this.config.holidayApiClientId,
      nonce,
      timestamp,
      signatureMethod,
      this.config.holidayApiSecret
    );

    const headers = {
      'ClientID': this.config.holidayApiClientId,
      'Nonce': nonce,
      'Timestamp': timestamp.toString(),
      'SignatureMethod': signatureMethod,
      'Signature': signature,
      'Content-Type': 'application/json'
    };

    this.ctx.logger('holiday-service').debug('API请求参数', {
      url,
      clientId: this.config.holidayApiClientId,
      nonce,
      timestamp,
      signature
    });

    const response = await fetch(url, { 
      method: 'GET',
      headers 
    });
    
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }

    const result: HolidayApiResponse = await response.json();
    
    if (!result.status || result.code !== 200) {
      throw new Error(`API返回错误: ${result.message}`);
    }

    this.ctx.logger('holiday-service').info(`成功获取${year}年节假日数据，共${result.data.length}个节假日`);
    
    return result.data;
  }

  /**
   * 生成签名
   * 根据官方文档：plainText = clientID + nonce + timestamp + signatureMethod
   * 使用 HMAC-SHA256 计算签名，返回小写十六进制
   */
  private async generateSignature(
    clientId: string,
    nonce: string,
    timestamp: string,
    signatureMethod: string,
    clientSecret: string
  ): Promise<string> {
    const crypto = await import('crypto');
    
    // 按照官方文档拼接字符串：clientID + nonce + timestamp + signatureMethod
    const plainText = clientId + nonce + timestamp + signatureMethod;
    
    this.ctx.logger('holiday-service').debug('签名计算详情', {
      clientId: clientId.substring(0, 8) + '...',
      nonce: nonce.substring(0, 8) + '...',
      timestamp,
      signatureMethod,
      plainText: plainText.substring(0, 50) + '...',
      clientSecret: clientSecret.substring(0, 8) + '...'
    });
    
    // 使用HMAC-SHA256计算签名，返回小写十六进制（重要！）
    const hmac = crypto.createHmac('sha256', clientSecret);
    hmac.update(plainText, 'utf8');
    const signature = hmac.digest('hex'); // 注意：不转大写，保持小写
    
    this.ctx.logger('holiday-service').debug('生成的签名', {
      signature: signature.substring(0, 16) + '...'
    });
    
    return signature;
  }

  /**
   * 生成随机字符串
   */
  private generateNonce(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.lastUpdate.clear();
    this.ctx.logger('holiday-service').info('节假日缓存已清理');
  }

  /**
   * 获取缓存状态
   */
  getCacheStatus(): { year: number; lastUpdate: Date; count: number }[] {
    const status: { year: number; lastUpdate: Date; count: number }[] = [];
    
    for (const [year, data] of this.cache.entries()) {
      const lastUpdate = this.lastUpdate.get(year);
      if (lastUpdate) {
        status.push({
          year,
          lastUpdate,
          count: data.length
        });
      }
    }
    
    return status.sort((a, b) => a.year - b.year);
  }
}