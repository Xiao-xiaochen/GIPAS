import { Context } from 'koishi';
import { Config } from '../config';
import { HolidayService } from '../Utils/HolidayService';

export function HolidayTest(ctx: Context, config: Config) {
  const logger = ctx.logger('holiday-test');
  const holidayService = new HolidayService(ctx, config);

  // 测试今天和明天的日期类型
  ctx.command('测试节假日', { authority: 3 })
    .action(async ({ session }) => {
      if (!config.holidayApiClientId || !config.holidayApiSecret) {
        return '❌ 节假日API未配置，请在插件配置中填写 holidayApiClientId 和 holidayApiSecret';
      }

      try {
        const today = new Date().toISOString().split('T')[0];
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        logger.info('开始测试节假日服务...');

        const [todayType, tomorrowType] = await Promise.all([
          holidayService.getDateType(today),
          holidayService.getDateType(tomorrow)
        ]);

        const [todayIsWorkday, todayIsHoliday] = await Promise.all([
          holidayService.isWorkday(today),
          holidayService.isHoliday(today)
        ]);

        const [tomorrowIsWorkday, tomorrowIsHoliday] = await Promise.all([
          holidayService.isWorkday(tomorrow),
          holidayService.isHoliday(tomorrow)
        ]);

        const cacheStatus = holidayService.getCacheStatus();

        const typeEmoji = {
          'workday': '💼',
          'holiday': '🎉',
          'weekend': '🏖️',
          'makeup_workday': '⚠️'
        };

        const typeText = {
          'workday': '工作日',
          'holiday': '节假日',
          'weekend': '周末',
          'makeup_workday': '调休工作日'
        };

        return [
          '🗓️ 节假日服务测试结果:',
          '',
          `📅 今天 (${today}):`,
          `   ${typeEmoji[todayType]} 类型: ${typeText[todayType]}`,
          `   💼 是工作日: ${todayIsWorkday ? '是' : '否'}`,
          `   🎉 是节假日: ${todayIsHoliday ? '是' : '否'}`,
          '',
          `📅 明天 (${tomorrow}):`,
          `   ${typeEmoji[tomorrowType]} 类型: ${typeText[tomorrowType]}`,
          `   💼 是工作日: ${tomorrowIsWorkday ? '是' : '否'}`,
          `   🎉 是节假日: ${tomorrowIsHoliday ? '是' : '否'}`,
          '',
          '💾 缓存状态:',
          cacheStatus.length > 0 
            ? cacheStatus.map(cache => 
                `   ${cache.year}年: ${cache.count}个节假日 (更新时间: ${cache.lastUpdate.toLocaleString()})`
              ).join('\n')
            : '   暂无缓存数据',
          '',
          '✅ 节假日服务运行正常！'
        ].join('\n');

      } catch (error) {
        logger.error('节假日服务测试失败:', error);
        return [
          '❌ 节假日服务测试失败:',
          '',
          `错误信息: ${error.message}`,
          '',
          '💡 请检查:',
          '1. API配置是否正确',
          '2. 网络连接是否正常',
          '3. API密钥是否有效'
        ].join('\n');
      }
    });

  // 测试特定日期
  ctx.command('测试日期 <date:string>', { authority: 3 })
    .action(async ({ session }, date) => {
      if (!config.holidayApiClientId || !config.holidayApiSecret) {
        return '❌ 节假日API未配置';
      }

      if (!date || !/^\d{4}-\d{1,2}-\d{1,2}$/.test(date)) {
        return '❌ 请提供正确的日期格式 (YYYY-MM-DD 或 YYYY-M-D)，例如: 2024-10-01 或 2025-8-30';
      }

      // 标准化日期格式
      // 标准化日期格式，避免时区问题
      const dateParts = date.split('-');
      if (dateParts.length !== 3) {
        return '❌ 无效的日期格式';
      }
      
      const year = parseInt(dateParts[0]);
      const month = parseInt(dateParts[1]);
      const day = parseInt(dateParts[2]);
      
      // 验证日期有效性
      const dateObj = new Date(year, month - 1, day);
      if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) {
        return '❌ 无效的日期，请检查日期是否正确';
      }
      
      // 转换为标准格式 YYYY-MM-DD
      const standardDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

      try {
        logger.info(`测试日期: ${standardDate}`);

        const [dateType, isWorkday, isHoliday] = await Promise.all([
          holidayService.getDateType(standardDate),
          holidayService.isWorkday(standardDate),
          holidayService.isHoliday(standardDate)
        ]);

        const typeEmoji = {
          'workday': '💼',
          'holiday': '🎉',
          'weekend': '🏖️',
          'makeup_workday': '⚠️'
        };

        const typeText = {
          'workday': '工作日',
          'holiday': '节假日',
          'weekend': '周末',
          'makeup_workday': '调休工作日'
        };

        return [
          `🗓️ 日期测试结果 (${standardDate}):`,
          '',
          `${typeEmoji[dateType]} 类型: ${typeText[dateType]}`,
          `💼 是工作日: ${isWorkday ? '是' : '否'}`,
          `🎉 是节假日: ${isHoliday ? '是' : '否'}`
        ].join('\n');

      } catch (error) {
        logger.error(`测试日期 ${standardDate} 失败:`, error);
        return `❌ 测试日期失败: ${error.message}`;
      }
    });

  // 清理节假日缓存
  ctx.command('清理节假日缓存', { authority: 4 })
    .action(async ({ session }) => {
      try {
        const oldStatus = holidayService.getCacheStatus();
        holidayService.clearCache();
        
        return [
          '🧹 节假日缓存清理完成!',
          '',
          '清理前缓存状态:',
          oldStatus.length > 0 
            ? oldStatus.map(cache => 
                `   ${cache.year}年: ${cache.count}个节假日`
              ).join('\n')
            : '   无缓存数据',
          '',
          '下次查询时将重新从API获取数据。'
        ].join('\n');

      } catch (error) {
        logger.error('清理缓存失败:', error);
        return `❌ 清理缓存失败: ${error.message}`;
      }
    });

  // 调试节假日API签名
  ctx.command('调试节假日签名', { authority: 4 })
    .action(async ({ session }) => {
      if (!config.holidayApiClientId || !config.holidayApiSecret) {
        return '❌ 节假日API未配置';
      }

      try {
        const crypto = await import('crypto');
        const year = new Date().getFullYear();
        const url = `https://www.idcd.com/api/holiday?year=${year}`;
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = generateTestNonce();
        const signatureMethod = 'HmacSHA256';
        
        // 生成签名 - 根据官方文档，使用小写十六进制
        const plainText = config.holidayApiClientId + nonce + timestamp + signatureMethod;
        const hmac = crypto.createHmac('sha256', config.holidayApiSecret);
        hmac.update(plainText, 'utf8');
        const signature = hmac.digest('hex'); // 保持小写，不转大写
        
        let message = `🔍 节假日API签名调试\n\n`;
        message += `🌐 请求URL: ${url}\n`;
        message += `🆔 ClientID: ${config.holidayApiClientId.substring(0, 8)}...\n`;
        message += `🔢 Nonce: ${nonce}\n`;
        message += `⏰ Timestamp: ${timestamp}\n`;
        message += `📝 SignatureMethod: ${signatureMethod}\n`;
        message += `🔗 PlainText: ${plainText.substring(0, 50)}...\n`;
        message += `🔐 Signature: ${signature.substring(0, 16)}...\n\n`;
        
        // 测试API调用
        const headers = {
          'ClientID': config.holidayApiClientId,
          'Nonce': nonce,
          'Timestamp': timestamp,
          'SignatureMethod': signatureMethod,
          'Signature': signature,
          'Content-Type': 'application/json'
        };
        
        message += `📤 请求头:\n`;
        for (const [key, value] of Object.entries(headers)) {
          if (key === 'ClientID' || key === 'Signature') {
            message += `  ${key}: ${value.substring(0, 16)}...\n`;
          } else {
            message += `  ${key}: ${value}\n`;
          }
        }
        
        const response = await fetch(url, { 
          method: 'GET',
          headers 
        });
        
        const result = await response.json();
        
        message += `\n📥 API响应:\n`;
        message += `  状态码: ${response.status}\n`;
        message += `  成功: ${result.status}\n`;
        message += `  代码: ${result.code}\n`;
        message += `  消息: ${result.message}\n`;
        
        if (result.data) {
          message += `  数据: ${result.data.length}个节假日\n`;
        }
        
        return message;
        
      } catch (error) {
        logger.error('调试节假日签名失败:', error);
        return `❌ 调试失败: ${error.message}`;
      }
    });

  function generateTestNonce(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
