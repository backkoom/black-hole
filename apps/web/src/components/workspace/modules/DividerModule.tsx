import { Divider } from 'antd';
import { readDividerLabel } from './config';

/**
 * 分割线模块 —— §7.5：读 config 的 label，可为空（空则只画线）。
 */
export function DividerModule({ config }: { config: Record<string, unknown> }) {
  const label = readDividerLabel(config);
  if (!label) return <Divider style={{ margin: '4px 0' }} />;
  return <Divider orientation="left" style={{ margin: '4px 0' }}>{label}</Divider>;
}
