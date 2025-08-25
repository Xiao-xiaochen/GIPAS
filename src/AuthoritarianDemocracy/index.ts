import { Context } from 'koishi';
import { Config } from '../config';
import { ElectionManagement } from './ElectionManagement';
import { RegularPowerTransfer } from './RegularPowerTransfer';
import { CandidateManagement } from './ElectionProcess/Candidate';
import { VotingSystem } from './ElectionProcess/Vote';
import { ReelectionPoll } from './ElectionProcess/Poll';
import { enhanceElectionDisplay } from '../Utils/Election/ElectionIdParser';
import { addDataFixCommands } from '../Utils/Election/FixCandidateData';
import { addAIServiceCommands } from '../Utils/AI/AIServiceCommands';
import { addSystemStatusCommands } from '../AutomatedManagement/GIPASInfo/SystemStatus';
import { addQuickStatusCommands } from '../AutomatedManagement/GIPASInfo/QuickStatus';

export function AuthoritarianDemocracy(ctx: Context, config: Config) {
  const logger = ctx.logger('gipas:authoritarian-democracy');

  if (!config.electionEnabled) {
    logger.info('威权民主选举系统已禁用');
    return;
  }

  // 威权民主选举核心功能
  ElectionManagement(ctx, config);
  RegularPowerTransfer(ctx, config);
  CandidateManagement(ctx, config);
  VotingSystem(ctx, config);
  ReelectionPoll(ctx, config);
  
  // 威权民主选举辅助功能
  enhanceElectionDisplay(ctx); // 人性化选举ID显示
  addDataFixCommands(ctx); // 候选人数据修复工具
  
  // 系统管理和AI服务功能
  addAIServiceCommands(ctx, config); // AI服务管理命令
  addSystemStatusCommands(ctx, config); // GIPAS系统状态命令
  addQuickStatusCommands(ctx, config); // GIPAS快速状态命令

  logger.info('威权民主选举系统已启用');
  logger.info(`投票配置: 每人${config.supportVotesPerPerson}张支持票, ${config.opposeVotesPerPerson}张反对票`);
}
