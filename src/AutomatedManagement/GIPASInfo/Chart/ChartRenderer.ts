import { createCanvas } from '@napi-rs/canvas';
import * as fs from 'fs';
import * as path from 'path';
import { ThemeConfig } from './ThemeManager';

/**
 * 图表渲染器
 */
export class ChartRenderer {
  private tempDir: string;
  private logger: any;

  constructor(tempDir: string, logger: any) {
    this.tempDir = tempDir;
    this.logger = logger;
  }

  /**
   * 创建现代化饼图
   */
  public async createModernPieChart(
    title: string, 
    data: Array<{name: string, value: number}>,
    theme: ThemeConfig
  ): Promise<string> {
    const width = 1000;
    const height = 800;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d') as any;
    
    // 设置背景
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, theme.backgroundGradient[0]);
    gradient.addColorStop(1, theme.backgroundGradient[1]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    
    // 添加纹理
    this.addTexturePattern(ctx, width, height, theme);
    
    const total = data.reduce((sum, item) => sum + item.value, 0);
    
    // 绘制标题
    this.drawModernTitle(ctx, title, total, width, theme);
    
    // 饼图参数
    const centerX = width / 2 - 80;
    const centerY = height / 2 + 40;
    const radius = 160;
    const innerRadius = 80;
    
    // 绘制饼图
    this.drawModernDonutChart(ctx, data, centerX, centerY, radius, innerRadius, theme);
    
    // 绘制中心信息
    this.drawCenterStats(ctx, total, centerX, centerY, theme);
    
    // 绘制图例
    this.drawModernLegend(ctx, data, total, centerX + radius + 100, centerY, theme);
    
    // 添加装饰
    this.addDecorativeElements(ctx, width, height, theme);
    
    // 保存图片
    const filename = `chart_${Date.now()}.png`;
    const filePath = path.join(this.tempDir, filename);
    
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, buffer);
    
    return filePath;
  }

  private addTexturePattern(ctx: any, width: number, height: number, theme: ThemeConfig) {
    ctx.globalAlpha = 0.03;
    ctx.fillStyle = theme.textPrimary;
    
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, 2 * Math.PI);
      ctx.fill();
    }
    
    ctx.globalAlpha = 1;
  }

  private drawModernTitle(ctx: any, title: string, total: number, width: number, theme: ThemeConfig) {
    ctx.fillStyle = theme.textPrimary;
    ctx.font = 'bold 32px "Microsoft YaHei", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 70);
    
    ctx.fillStyle = theme.textSecondary;
    ctx.font = '18px "Microsoft YaHei", Arial, sans-serif';
    ctx.fillText(`总计 ${total} 人`, width / 2, 100);
    
    // 装饰线
    const lineGradient = ctx.createLinearGradient(width / 2 - 100, 0, width / 2 + 100, 0);
    lineGradient.addColorStop(0, 'transparent');
    lineGradient.addColorStop(0.5, theme.accentColor);
    lineGradient.addColorStop(1, 'transparent');
    
    ctx.strokeStyle = lineGradient;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(width / 2 - 100, 120);
    ctx.lineTo(width / 2 + 100, 120);
    ctx.stroke();
  }

  private drawModernDonutChart(
    ctx: any, 
    data: Array<{name: string, value: number}>, 
    centerX: number, 
    centerY: number, 
    radius: number, 
    innerRadius: number, 
    theme: ThemeConfig
  ) {
    const total = data.reduce((sum, item) => sum + item.value, 0);
    let currentAngle = -Math.PI / 2;
    
    ctx.shadowColor = theme.shadowColor;
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
    
    data.forEach((item, index) => {
      const sliceAngle = (item.value / total) * 2 * Math.PI;
      const color = theme.chartColors[index % theme.chartColors.length];
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.arc(centerX, centerY, innerRadius, currentAngle + sliceAngle, currentAngle, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = theme.background;
      ctx.lineWidth = 2;
      ctx.stroke();
      
      currentAngle += sliceAngle;
    });
  }

  private drawCenterStats(ctx: any, total: number, centerX: number, centerY: number, theme: ThemeConfig) {
    const centerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 70);
    centerGradient.addColorStop(0, theme.cardBackground);
    centerGradient.addColorStop(1, theme.background);
    
    ctx.fillStyle = centerGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 70, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.strokeStyle = theme.borderColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = theme.textPrimary;
    ctx.font = 'bold 28px "Microsoft YaHei", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(total.toString(), centerX, centerY - 8);
    
    ctx.font = '14px "Microsoft YaHei", Arial, sans-serif';
    ctx.fillStyle = theme.textSecondary;
    ctx.fillText('总人数', centerX, centerY + 18);
  }

  private drawModernLegend(
    ctx: any, 
    data: Array<{name: string, value: number}>, 
    total: number, 
    legendX: number, 
    legendY: number, 
    theme: ThemeConfig
  ) {
    const legendStartY = legendY - (data.length * 50) / 2;
    
    const cardGradient = ctx.createLinearGradient(legendX - 20, 0, legendX + 220, 0);
    cardGradient.addColorStop(0, theme.cardBackground);
    cardGradient.addColorStop(1, theme.background + '80');
    
    ctx.fillStyle = cardGradient;
    ctx.strokeStyle = theme.borderColor;
    ctx.lineWidth = 1;
    
    const cardWidth = 240;
    const cardHeight = data.length * 50 + 30;
    const cardRadius = 12;
    
    // 绘制圆角矩形
    this.drawRoundedRect(ctx, legendX - 20, legendStartY - 15, cardWidth, cardHeight, cardRadius);
    ctx.fill();
    ctx.stroke();
    
    // 图例项
    data.forEach((item, index) => {
      const y = legendStartY + index * 50;
      const color = theme.chartColors[index % theme.chartColors.length];
      const percentage = ((item.value / total) * 100).toFixed(1);
      
      // 颜色指示器
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(legendX, y + 10, 12, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.strokeStyle = theme.background;
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // 文字信息
      ctx.fillStyle = theme.textPrimary;
      ctx.font = 'bold 16px "Microsoft YaHei", Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(item.name, legendX + 25, y + 8);
      
      ctx.fillStyle = theme.textSecondary;
      ctx.font = '14px "Microsoft YaHei", Arial, sans-serif';
      ctx.fillText(`${item.value} 人 (${percentage}%)`, legendX + 25, y + 25);
    });
  }

  private addDecorativeElements(ctx: any, width: number, height: number, theme: ThemeConfig) {
    ctx.strokeStyle = theme.accentColor + '40';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(80, 80, 30, 0, Math.PI / 2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(width - 80, height - 80, 30, Math.PI, 3 * Math.PI / 2);
    ctx.stroke();
  }

  private drawRoundedRect(ctx: any, x: number, y: number, width: number, height: number, radius: number) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}