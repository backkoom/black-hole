import { useQuery } from '@tanstack/react-query';
import type { OrgNode } from '@blackhole/shared/types';
import { fetchOrgTree, orgKeys } from '../api/org';

/**
 * 组织树查询 —— 组织架构页与账号管理页共用。
 * 普通用户不调组织树接口（v2 §2.3），这两个页面都在 RequireAdmin 之下。
 */
export function useOrgTree() {
  return useQuery({
    queryKey: orgKeys.tree,
    queryFn: fetchOrgTree,
  });
}

/** 摊平后的组织节点（含完整路径名），供下拉选择使用 */
export function toOrgOptions(nodes: OrgNode[] | undefined): { value: number; label: string }[] {
  if (!nodes) return [];
  const out: { value: number; label: string }[] = [];
  const walk = (list: OrgNode[], ancestors: OrgNode[]): void => {
    for (const node of list) {
      const path = [...ancestors, node];
      out.push({ value: node.id, label: path.map((item) => item.name).join(' / ') });
      walk(node.children, path);
    }
  };
  walk(nodes, []);
  return out;
}
