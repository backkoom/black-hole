import { Progress } from 'antd';
import type { Project } from '@blackhole/shared/types';

/**
 * 项目进度条 —— pages.md §4 / §5 的「进度条 + 百分比」。
 *
 * 口径：
 * - **百分比直接用接口返回的 `progress`**（服务端已四舍五入算好，前端不再自己算一遍）；
 * - 进行中用主色，已完成用绿色（执行包 §8.6）；
 * - 进度条颜色走 AntD token（primary / success），不另造色板。
 */

interface ProjectProgressProps {
  project: Project;
  /** 大号模式：详情页头部用 */
  size?: 'small' | 'large';
}

export function ProjectProgress({ project, size = 'small' }: ProjectProgressProps) {
  const isDone = project.status === 'done';
  return (
    <div className={size === 'large' ? 'wb-progress-large' : 'wb-progress'}>
      <Progress
        percent={project.progress}
        // line 型 Progress 用 size=[宽, 高] 控高度（strokeWidth 已废弃）
        size={['100%', size === 'large' ? 14 : 7]}
        strokeColor={isDone ? 'var(--green)' : 'var(--primary)'}
        trailColor="#eef1f6"
        format={(percent) => <span className="wb-progress-percent">{percent}%</span>}
      />
    </div>
  );
}
