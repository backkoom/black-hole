import { describe, expect, it } from 'vitest';
import {
  ACTIVE_MODULE_KEYS,
  DEFAULT_MODULE_CONFIGS,
  DEFAULT_TEMPLATE_ITEMS,
  MODULES,
  PLACEHOLDER_MODULE_KEYS,
  validateModuleConfig,
} from '../src/modules.js';

describe('模块清单（执行包 §7.1）', () => {
  it('共 15 个模块，12 active + 3 placeholder', () => {
    expect(MODULES).toHaveLength(15);
    expect(ACTIVE_MODULE_KEYS).toHaveLength(12);
    expect(PLACEHOLDER_MODULE_KEYS).toHaveLength(3);
  });

  it('分类计数为 2/2/2/3/6', () => {
    const count = (c: string) => MODULES.filter((m) => m.category === c).length;
    expect(count('任务与日程')).toBe(2);
    expect(count('快捷入口')).toBe(2);
    expect(count('项目与数据')).toBe(2);
    expect(count('知识与资料')).toBe(3);
    expect(count('个性模块')).toBe(6);
  });

  it('module_key 唯一', () => {
    expect(new Set(MODULES.map((m) => m.key)).size).toBe(15);
  });

  it('占位模块只有 file / knowledge-list / ai', () => {
    expect([...PLACEHOLDER_MODULE_KEYS].sort()).toEqual(['ai', 'file', 'knowledge-list']);
  });
});

describe('默认模板（v2 §4.9）', () => {
  it('4 条，顺序为 todo / project-progress / quick-entry / idea', () => {
    expect(DEFAULT_TEMPLATE_ITEMS.map((i) => i.moduleKey)).toEqual([
      'todo',
      'project-progress',
      'quick-entry',
      'idea',
    ]);
    expect(DEFAULT_TEMPLATE_ITEMS.map((i) => `${i.w}x${i.h}`)).toEqual(['6x4', '6x4', '3x4', '3x4']);
  });

  it('模板不含占位模块', () => {
    expect(DEFAULT_TEMPLATE_ITEMS.some((i) => PLACEHOLDER_MODULE_KEYS.includes(i.moduleKey))).toBe(false);
  });
});

describe('config schema（执行包 §7.3 / §7.4）', () => {
  it('quick-entry 默认 4 个入口', () => {
    const cfg = validateModuleConfig('quick-entry', DEFAULT_MODULE_CONFIGS['quick-entry']);
    expect((cfg as { items: unknown[] }).items).toHaveLength(4);
  });

  it('basic 模块 config 固定 {}，未知字段被剥离', () => {
    expect(validateModuleConfig('todo', { anything: 1 })).toEqual({});
    expect(validateModuleConfig('idea', undefined)).toEqual({});
  });

  it('placeholder 模块被拒绝，且是 422 级业务错误（不是 500）', () => {
    for (const key of PLACEHOLDER_MODULE_KEYS) {
      expect(() => validateModuleConfig(key, {})).toThrow(/模块不可用/);
    }
  });

  it('未知模块被拒绝', () => {
    expect(() => validateModuleConfig('not-a-module', {})).toThrow();
  });

  it('quick-entry 允许站内绝对路径，拒绝 javascript: 与 //', () => {
    const ok = validateModuleConfig('quick-entry', { items: [{ label: 'a', url: '/tasks' }] });
    expect(ok).toBeTruthy();
    expect(() =>
      validateModuleConfig('quick-entry', { items: [{ label: 'a', url: 'javascript:alert(1)' }] }),
    ).toThrow();
    expect(() =>
      validateModuleConfig('quick-entry', { items: [{ label: 'a', url: '//evil.example.com' }] }),
    ).toThrow();
  });

  it('links 只允许 http/https', () => {
    expect(validateModuleConfig('links', { items: [{ label: 'a', url: 'http://x.example' }] })).toBeTruthy();
    expect(() => validateModuleConfig('links', { items: [{ label: 'a', url: '/tasks' }] })).toThrow();
  });

  it('embed 只允许 https，但允许空串', () => {
    expect(validateModuleConfig('embed', { url: '' })).toBeTruthy();
    expect(validateModuleConfig('embed', { url: 'https://x.example' })).toBeTruthy();
    expect(() => validateModuleConfig('embed', { url: 'http://x.example' })).toThrow();
  });

  it('gallery 最多 9 张，url 必须 https', () => {
    const img = { url: 'https://x.example/a.png' };
    expect(validateModuleConfig('gallery', { images: Array.from({ length: 9 }, () => img) })).toBeTruthy();
    expect(() =>
      validateModuleConfig('gallery', { images: Array.from({ length: 10 }, () => img) }),
    ).toThrow();
  });

  it('notice.level 只有 info / warning', () => {
    expect(validateModuleConfig('notice', { title: '', body: '', level: 'warning' })).toBeTruthy();
    expect(() => validateModuleConfig('notice', { title: '', body: '', level: 'error' })).toThrow();
  });

  it('text.body 最多 2000 字，notice.body 最多 500 字', () => {
    expect(() => validateModuleConfig('text', { title: '', body: 'x'.repeat(2001) })).toThrow();
    expect(() => validateModuleConfig('notice', { title: '', body: 'x'.repeat(501) })).toThrow();
  });
});
