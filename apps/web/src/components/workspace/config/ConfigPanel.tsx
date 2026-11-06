import { useEffect, useState } from 'react';
import { Button, Drawer, Form, Input, InputNumber, Select, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { MODULE_BY_KEY } from '@blackhole/shared/modules';
import { isHttpUrl, isHttpsUrl, isQuickEntryUrl } from '../../../utils/urlRules';
import { validateConfig } from './validateConfig';

/**
 * content 模块的配置面板 —— §7.3 / §7.6。
 *
 * 7 个 content 模块各有自己的表单：quick-entry / text / notice / links / embed / gallery / divider。
 *
 * 安全要求：
 * - URL 白名单在**表单层**就拦住（quick-entry 允许 http/https 或站内绝对路径；links 只允许 http/https；
 *   embed / gallery 只允许 https），不让非法地址进到提交那一步；
 * - 提交时再用共享包的 `validateModuleConfig` 兜底校验一次；
 * - 所有输入都按**纯文本**渲染，配置文件里不放 HTML。
 */

export interface ConfigPanelProps {
  open: boolean;
  /** 当前编辑的模块 key */
  moduleKey: string | null;
  /** 当前模块已有的 config */
  config: Record<string, unknown>;
  onClose: () => void;
  /** 校验通过后回调，参数为规范化后的 config */
  onSave: (moduleKey: string, config: Record<string, unknown>) => void;
}

export function ConfigPanel({ open, moduleKey, config, onClose, onSave }: ConfigPanelProps) {
  const [form] = Form.useForm();
  const [rootError, setRootError] = useState<string | null>(null);
  const moduleName = moduleKey ? (MODULE_BY_KEY[moduleKey]?.name ?? moduleKey) : '';

  // 打开面板后把已有 config 铺进表单。
  // 关键点：Form.List 是在**挂载那一刻**从 store 里读列表长度的，
  // 所以光靠 setFieldsValue 不够 —— 必须用 initialValues 让值在首次渲染就进 store。
  // key={moduleKey} 保证换模块时表单整体重建，initialValues 才会重新生效。
  useEffect(() => {
    if (!open || !moduleKey) return;
    setRootError(null);
    form.setFieldsValue(normalizeFields(moduleKey, config));
  }, [open, moduleKey, config, form]);

  const handleOk = async (): Promise<void> => {
    if (!moduleKey) return;
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      // 表单级校验没通过，错误已经标在字段上
      return;
    }
    const result = validateConfig(moduleKey, normalizeForSchema(moduleKey, values));
    if (!result.ok) {
      setRootError(result.message);
      return;
    }
    setRootError(null);
    onSave(moduleKey, result.value);
  };

  return (
    <Drawer
      title={moduleName ? `配置「${moduleName}」` : '配置模块'}
      open={open}
      width={420}
      onClose={onClose}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={() => void handleOk()}>
            保存
          </Button>
        </Space>
      }
    >
      <Form
        key={moduleKey ?? 'none'}
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={moduleKey ? normalizeFields(moduleKey, config) : {}}
        onValuesChange={() => setRootError(null)}
      >
        {rootError ? <div className="wb-config-error">{rootError}</div> : null}
        {moduleKey ? <ConfigForm moduleKey={moduleKey} /> : null}
      </Form>
    </Drawer>
  );
}

/** 把已有 config 铺进表单 */
function normalizeFields(moduleKey: string, config: Record<string, unknown>): Record<string, unknown> {
  switch (moduleKey) {
    case 'quick-entry':
    case 'links':
      return { items: readItemList(config.items) };
    case 'text':
      return { title: str(config.title), body: str(config.body) };
    case 'notice':
      return {
        title: str(config.title),
        body: str(config.body),
        level: config.level === 'warning' ? 'warning' : 'info',
      };
    case 'embed':
      return {
        url: str(config.url),
        height: typeof config.height === 'number' ? config.height : 400,
      };
    case 'gallery':
      return { images: readImageList(config.images) };
    case 'divider':
      return { label: str(config.label) };
    default:
      return {};
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * 表单值 → schema 值的归一化。
 *
 * AntD 的 InputNumber 清空后给的是 `null`，而共享包的 schema 里
 * `embed.height` 是 `z.number().optional()`（不接受 null），所以这里把空值去掉。
 */
function normalizeForSchema(
  moduleKey: string,
  values: Record<string, unknown>,
): Record<string, unknown> {
  if (moduleKey !== 'embed') return values;
  const height = values.height;
  if (height === null || height === undefined) {
    const next = { ...values };
    delete next.height;
    return next;
  }
  return values;
}

function readItemList(value: unknown): { label: string; url: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { label: string; url: string }[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    out.push({ label: str(record.label), url: str(record.url) });
  }
  return out;
}

function readImageList(value: unknown): { url: string; caption: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { url: string; caption: string }[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    out.push({ url: str(record.url), caption: str(record.caption) });
  }
  return out;
}

/** 按模块 key 渲染对应表单 */
function ConfigForm({ moduleKey }: { moduleKey: string }) {
  switch (moduleKey) {
    case 'quick-entry':
      return <QuickEntryForm />;
    case 'links':
      return <LinksForm />;
    case 'text':
      return <TextForm />;
    case 'notice':
      return <NoticeForm />;
    case 'embed':
      return <EmbedForm />;
    case 'gallery':
      return <GalleryForm />;
    case 'divider':
      return <DividerForm />;
    default:
      return null;
  }
}

function QuickEntryForm() {
  return (
    <Form.List name="items">
      {(fields, { add, remove }) => (
        <>
          {fields.map((field) => (
            <div className="wb-config-row" key={field.key}>
              <Form.Item
                name={[field.name, 'label']}
                label="名称"
                rules={[{ required: true, message: '请输入名称' }]}
              >
                <Input maxLength={64} placeholder="项目" />
              </Form.Item>
              <Form.Item
                name={[field.name, 'url']}
                label="地址"
                rules={[
                  { required: true, message: '请输入地址' },
                  {
                    validator: (_, value: unknown) => {
                      const text = typeof value === 'string' ? value.trim() : '';
                      if (!text) return Promise.resolve();
                      if (isQuickEntryUrl(text)) return Promise.resolve();
                      return Promise.reject(new Error('只允许 http/https 地址或站内绝对路径'));
                    },
                  },
                ]}
              >
                <Input maxLength={2048} placeholder="/projects 或 https://example.com" />
              </Form.Item>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label="删除该入口"
                onClick={() => remove(field.name)}
              />
            </div>
          ))}
          <Form.Item>
            <Button
              block
              icon={<PlusOutlined />}
              disabled={fields.length >= 8}
              onClick={() => add({ label: '', url: '' })}
            >
              添加入口（最多 8 个）
            </Button>
          </Form.Item>
        </>
      )}
    </Form.List>
  );
}

function LinksForm() {
  return (
    <Form.List name="items">
      {(fields, { add, remove }) => (
        <>
          {fields.map((field) => (
            <div className="wb-config-row" key={field.key}>
              <Form.Item
                name={[field.name, 'label']}
                label="名称"
                rules={[{ required: true, message: '请输入名称' }]}
              >
                <Input maxLength={64} placeholder="文档" />
              </Form.Item>
              <Form.Item
                name={[field.name, 'url']}
                label="地址"
                rules={[
                  { required: true, message: '请输入地址' },
                  {
                    validator: (_, value: unknown) => {
                      const text = typeof value === 'string' ? value.trim() : '';
                      if (!text) return Promise.resolve();
                      if (isHttpUrl(text)) return Promise.resolve();
                      return Promise.reject(new Error('只允许 http/https 地址'));
                    },
                  },
                ]}
              >
                <Input maxLength={2048} placeholder="https://example.com" />
              </Form.Item>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label="删除该链接"
                onClick={() => remove(field.name)}
              />
            </div>
          ))}
          <Form.Item>
            <Button
              block
              icon={<PlusOutlined />}
              disabled={fields.length >= 8}
              onClick={() => add({ label: '', url: '' })}
            >
              添加链接（最多 8 个）
            </Button>
          </Form.Item>
        </>
      )}
    </Form.List>
  );
}

function TextForm() {
  return (
    <>
      <Form.Item name="title" label="标题">
        <Input maxLength={128} placeholder="标题" />
      </Form.Item>
      <Form.Item
        name="body"
        label="正文"
        rules={[{ max: 2000, message: '正文不能超过 2000 字' }]}
      >
        <Input.TextArea rows={8} maxLength={2000} showCount placeholder="纯文本正文" />
      </Form.Item>
    </>
  );
}

function NoticeForm() {
  return (
    <>
      <Form.Item name="title" label="标题">
        <Input maxLength={128} placeholder="标题" />
      </Form.Item>
      <Form.Item
        name="body"
        label="正文"
        rules={[{ max: 500, message: '正文不能超过 500 字' }]}
      >
        <Input.TextArea rows={5} maxLength={500} showCount placeholder="纯文本正文" />
      </Form.Item>
      <Form.Item name="level" label="级别" initialValue="info">
        <Select
          options={[
            { value: 'info', label: '普通通知' },
            { value: 'warning', label: '警示通知' },
          ]}
        />
      </Form.Item>
    </>
  );
}

function EmbedForm() {
  return (
    <>
      <Form.Item
        name="url"
        label="嵌入地址"
        rules={[
          {
            validator: (_, value: unknown) => {
              const text = typeof value === 'string' ? value.trim() : '';
              if (!text) return Promise.resolve();
              if (isHttpsUrl(text)) return Promise.resolve();
              return Promise.reject(new Error('只允许 https 地址'));
            },
          },
        ]}
        extra="留空表示尚未配置；只允许 https 地址"
      >
        <Input maxLength={2048} placeholder="https://example.com/embed" />
      </Form.Item>
      <Form.Item name="height" label="高度（px）" extra="留空使用默认 400">
        <InputNumber min={120} max={1200} step={20} style={{ width: '100%' }} />
      </Form.Item>
    </>
  );
}

function GalleryForm() {
  return (
    <Form.List name="images">
      {(fields, { add, remove }) => (
        <>
          {fields.map((field) => (
            <div className="wb-config-row" key={field.key}>
              <Form.Item
                name={[field.name, 'url']}
                label="图片地址"
                rules={[
                  { required: true, message: '请输入图片地址' },
                  {
                    validator: (_, value: unknown) => {
                      const text = typeof value === 'string' ? value.trim() : '';
                      if (!text) return Promise.resolve();
                      if (isHttpsUrl(text)) return Promise.resolve();
                      return Promise.reject(new Error('只允许 https 地址'));
                    },
                  },
                ]}
              >
                <Input maxLength={2048} placeholder="https://example.com/a.png" />
              </Form.Item>
              <Form.Item name={[field.name, 'caption']} label="说明">
                <Input maxLength={128} placeholder="可留空" />
              </Form.Item>
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label="删除该图片"
                onClick={() => remove(field.name)}
              />
            </div>
          ))}
          <Form.Item>
            <Button
              block
              icon={<PlusOutlined />}
              disabled={fields.length >= 9}
              onClick={() => add({ url: '', caption: '' })}
            >
              添加图片（最多 9 张）
            </Button>
          </Form.Item>
        </>
      )}
    </Form.List>
  );
}

function DividerForm() {
  return (
    <Form.Item
      name="label"
      label="标签"
      rules={[{ max: 20, message: '标签不能超过 20 字' }]}
      extra="留空则只显示一条分割线"
    >
      <Input maxLength={20} placeholder="章节" />
    </Form.Item>
  );
}
