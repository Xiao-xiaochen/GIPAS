import { Context } from 'koishi';
import { createCanvas } from '@napi-rs/canvas';
import * as echarts from 'echarts';
import { Config } from '../../../config';
import * as fs from 'fs';
import * as path from 'path';
import { segment } from 'koishi';

// 饼图生成器类
export class PieChartGenerator {
  private ctx: Context;
  private config: Config;
  private logger: any;
  private tempDir: string;

  constructor(ctx: Context, config: Config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger('gipas:pie-chart');
    
    // 创建临时目录用于存储生成的图表
    this.tempDir = path.join(process.cwd(), 'temp_charts');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * 生成群档案填写情况饼图
   * @param guildId 群组ID
   * @returns 生成的图片路径
   */
  async generateProfileCompletionChart(guildId: string): Promise<string> {
    try {
      // 获取群成员列表
      const members = await this.getGroupMembers(guildId);
      if (!members || members.length === 0) {
        throw new Error('无法获取群成员列表');
      }

      // 获取已填写档案的用户
      const profiles = await this.ctx.database.get('FileSystem', { groupId: guildId });
      const profileUserIds = new Set(profiles.map(p => p.userId));

      // 计算填写和未填写的人数
      const completed = profileUserIds.size;
      const notCompleted = members.length - completed;

      // 生成饼图
      const chartPath = await this.createPieChart(
        '群档案填写情况统计',
        [
          { name: '已填写', value: completed },
          { name: '未填写', value: notCompleted }
        ],
        ['#91cc75', '#ee6666']
      );

      return chartPath;
    } catch (error) {
      this.logger.error('生成档案填写情况饼图失败:', error);
      throw error;
    }
  }

  /**
   * 获取群成员列表
   * @param guildId 群组ID
   * @returns 群成员ID列表
   */
  private async getGroupMembers(guildId: string): Promise<string[]> {
    try {
      // 使用OneBot API获取群成员列表
      const bot = this.ctx.bots.find(bot => bot.platform === 'onebot');
      if (!bot) {
        throw new Error('未找到OneBot实例');
      }

      const response = await bot.internal.getGroupMemberList({ group_id: Number(guildId) });
      return response.map(member => String(member.user_id));
    } catch (error) {
      this.logger.error('获取群成员列表失败:', error);
      throw error;
    }
  }

  /**
   * 创建饼图
   * @param title 图表标题
   * @param data 数据数组，格式为[{name: string, value: number}]
   * @param colors 颜色数组
   * @returns 生成的图片路径
   */
  private async createPieChart(title: string, data: Array<{name: string, value: number}>, colors: string[]): Promise<string> {
    // 由于在Node环境中使用echarts需要特殊处理，我们需要使用一些技巧
    
    // 注册必要的组件
    echarts.use([
      require('echarts/lib/chart/pie'),
      require('echarts/lib/component/title'),
      require('echarts/lib/component/tooltip'),
      require('echarts/lib/component/legend')
    ]);
    
    // 创建一个虚拟的DOM环境
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.document = dom.window.document;
    
    // 创建一个div元素作为echarts的容器
    const container = document.createElement('div');
    container.style.width = '800px';
    container.style.height = '600px';
    document.body.appendChild(container);
    
    // 初始化echarts实例
    const chart = echarts.init(container);
    
    // 配置饼图选项
    const option = {
      title: {
        text: title,
        left: 'center',
        textStyle: {
          fontSize: 20,
          color: '#333'
        }
      },
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b}: {c} ({d}%)'
      },
      legend: {
        orient: 'vertical',
        left: 'left',
        data: data.map(item => item.name)
      },
      series: [
        {
          name: '档案统计',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: {
            show: true,
            formatter: '{b}: {c} ({d}%)'
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 16,
              fontWeight: 'bold'
            }
          },
          labelLine: {
            show: true
          },
          data: data,
          color: colors
        }
      ]
    };
    
    // 设置配置项
    chart.setOption(option);
    
    // 获取SVG内容
    const svgStr = chart.renderToSVGString();
    
    // 使用canvas渲染SVG
    const width = 800;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // 设置白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // 使用canvg将SVG渲染到canvas
    const Canvg = require('canvg');
    const v = await Canvg.fromString(ctx, svgStr);
    await v.render();
    
    // 保存为图片
    const filename = `chart_${Date.now()}.png`;
    const filePath = path.join(this.tempDir, filename);
    
    // 将画布内容写入文件
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buffer);
    
    return filePath;
  }
}

// 添加命令
export function addChartCommands(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:chart-commands');
  const chartGenerator = new PieChartGenerator(ctx, config);

  // 档案填写情况统计命令
  ctx.command('档案统计', { authority: 2 })
    .action(async ({ session }) => {
      if (!session) {
        return '无效的会话';
      }

      try {
        const guildId = session.guildId;
        if (!guildId) {
          return '此命令只能在群聊中使用';
        }

        // 检查是否启用了档案系统
        if (!config.enabledGroups.includes(guildId)) {
          return '此群未启用档案系统';
        }

        // 发送正在生成的提示
        await session.send('正在生成档案填写情况统计图...');
        
        // 生成饼图
        const chartPath = await chartGenerator.generateProfileCompletionChart(guildId);
        
        // 发送图片
        return segment.image(`file://${chartPath}`);
      } catch (error) {
        logger.error('生成档案统计图失败:', error);
        return '❌ 生成统计图失败，请查看日志';
      }
    });

  logger.info('GIPAS图表命令已加载');
}
