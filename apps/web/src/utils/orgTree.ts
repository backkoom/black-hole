/**
 * 组织树工具 —— 把 GET /api/org/tree 的 nodes 摊平成可筛选 / 可选父级的列表。
 *
 * 口径（openapi OrgNode）：
 * - level 根为 1，每级 +1；层级上限由服务端 MAX_ORG_LEVEL 控制，前端不写死；
 * - userCount 只统计直接挂在该节点的用户（含 disabled），不递归；
 * - children 为空即「末级节点」，人员只能挂在末级节点上。
 */
import type { OrgNode } from '@workbench/shared/types';

export interface OrgFlatNode {
  node: OrgNode;
  /** 从根到自身的路径（含自身） */
  path: OrgNode[];
  /** 路径名，' / ' 连接，例如「示例研究院 / 示例事业部 / 示例中心」 */
  pathLabel: string;
}

/** 深度优先摊平整棵树 */
export function flattenOrgTree(nodes: OrgNode[]): OrgFlatNode[] {
  const out: OrgFlatNode[] = [];
  const walk = (list: OrgNode[], ancestors: OrgNode[]): void => {
    for (const node of list) {
      const path = [...ancestors, node];
      out.push({ node, path, pathLabel: path.map((item) => item.name).join(' / ') });
      walk(node.children, path);
    }
  };
  walk(nodes, []);
  return out;
}

/** 找到某个节点（含自身） */
export function findOrgNode(nodes: OrgNode[], id: number): OrgNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findOrgNode(node.children, id);
    if (hit) return hit;
  }
  return null;
}

/** 从根到某节点的路径（面包屑用） */
export function orgPathOf(nodes: OrgNode[], id: number): OrgNode[] {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const sub = orgPathOf(node.children, id);
    if (sub.length > 0) return [node, ...sub];
  }
  return [];
}

/** 某节点的全部子孙 id（含自身）—— 移动时用来排除「自身与子孙」 */
export function subtreeIds(node: OrgNode): Set<number> {
  const ids = new Set<number>([node.id]);
  const walk = (list: OrgNode[]): void => {
    for (const child of list) {
      ids.add(child.id);
      walk(child.children);
    }
  };
  walk(node.children);
  return ids;
}

/** 是否末级（没有子节点）—— 人员只能挂在末级节点上 */
export function isLeafOrg(node: OrgNode): boolean {
  return node.children.length === 0;
}
