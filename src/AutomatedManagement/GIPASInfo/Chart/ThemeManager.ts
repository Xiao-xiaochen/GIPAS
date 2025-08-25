/**
 * 主题配置接口
 */
export interface ThemeConfig {
  background: string;
  backgroundGradient: string[];
  textPrimary: string;
  textSecondary: string;
  cardBackground: string;
  borderColor: string;
  shadowColor: string;
  accentColor: string;
  chartColors: string[];
}

/**
 * 主题管理器
 */
export class ThemeManager {
  private currentTheme: 'light' | 'dark' = 'light';
  private themeScheduler: NodeJS.Timeout | null = null;
  private logger: any;

  // 定义主题
  private themes = {
    light: {
      background: '#ffffff',
      backgroundGradient: ['#f8fafc', '#e2e8f0'],
      textPrimary: '#1e293b',
      textSecondary: '#64748b',
      cardBackground: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e2e8f0',
      shadowColor: 'rgba(0, 0, 0, 0.1)',
      accentColor: '#3b82f6',
      chartColors: ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']
    } as ThemeConfig,
    dark: {
      background: '#0f172a',
      backgroundGradient: ['#1e293b', '#0f172a'],
      textPrimary: '#f1f5f9',
      textSecondary: '#94a3b8',
      cardBackground: 'rgba(30, 41, 59, 0.95)',
      borderColor: '#334155',
      shadowColor: 'rgba(0, 0, 0, 0.3)',
      accentColor: '#60a5fa',
      chartColors: ['#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#22d3ee', '#fb923c']
    } as ThemeConfig
  };

  constructor(logger: any) {
    this.logger = logger;
    this.startThemeScheduler();
  }

  /**
   * 启动定时主题切换器
   */
  private startThemeScheduler() {
    const checkAndSwitchTheme = () => {
      const now = new Date();
      const hour = now.getHours();
      
      // 18:00-6:00 使用深色模式，6:00-18:00 使用浅色模式
      const shouldBeDark = hour >= 18 || hour < 6;
      const newTheme = shouldBeDark ? 'dark' : 'light';
      
      if (this.currentTheme !== newTheme) {
        this.currentTheme = newTheme;
        this.logger.info(`🌙 主题已自动切换到: ${newTheme === 'dark' ? '深色模式' : '浅色模式'}`);
      }
    };

    checkAndSwitchTheme();
    this.themeScheduler = setInterval(checkAndSwitchTheme, 60 * 60 * 1000);
  }

  /**
   * 手动切换主题
   */
  public switchTheme(theme?: 'light' | 'dark') {
    if (theme) {
      this.currentTheme = theme;
    } else {
      this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    }
    this.logger.info(`🎨 手动切换主题到: ${this.currentTheme === 'dark' ? '深色模式' : '浅色模式'}`);
  }

  /**
   * 获取当前主题配置
   */
  public getCurrentTheme(): ThemeConfig {
    return this.themes[this.currentTheme];
  }

  /**
   * 获取当前主题名称
   */
  public getCurrentThemeName(): 'light' | 'dark' {
    return this.currentTheme;
  }

  /**
   * 销毁定时器
   */
  public dispose() {
    if (this.themeScheduler) {
      clearInterval(this.themeScheduler);
      this.themeScheduler = null;
    }
  }
}