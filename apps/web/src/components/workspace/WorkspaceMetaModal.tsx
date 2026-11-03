import { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';

/**
 * 名称 / 副标题编辑弹窗 —— pages.md §2「名称与副标题保存走单独 PUT」。
 *
 * - 工作台名称：1 至 128，去首尾空格，空名不允许（契约 §6.5）；
 * - 副标题：0 至 256，去首尾空格，留空存 null（服务端 normalize 处理）。
 */

interface WorkspaceMetaModalProps {
  open: boolean;
  /** 当前名称 */
  name: string;
  /** 当前副标题（null 表示空） */
  subtitle: string | null;
  /** 弹窗标题 */
  title: string;
  /** 名称字段的 label */
  nameLabel: string;
  /** 副标题字段的 label */
  subtitleLabel: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (values: { name: string; subtitle: string }) => void;
}

interface MetaFormValues {
  name: string;
  subtitle: string;
}

export function WorkspaceMetaModal({
  open,
  name,
  subtitle,
  title,
  nameLabel,
  subtitleLabel,
  saving,
  onCancel,
  onSubmit,
}: WorkspaceMetaModalProps) {
  const [form] = Form.useForm<MetaFormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ name, subtitle: subtitle ?? '' });
  }, [open, name, subtitle, form]);

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onCancel}
      maskClosable={false}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      onOk={() => {
        void form.validateFields().then((values) => {
          onSubmit({ name: values.name.trim(), subtitle: values.subtitle.trim() });
        });
      }}
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="name"
          label={nameLabel}
          rules={[
            { required: true, message: '请输入名称' },
            { max: 128, message: '名称不能超过 128 个字符' },
          ]}
        >
          <Input maxLength={128} showCount placeholder="请输入名称" />
        </Form.Item>
        <Form.Item
          name="subtitle"
          label={subtitleLabel}
          rules={[{ max: 256, message: '副标题不能超过 256 个字符' }]}
        >
          <Input.TextArea maxLength={256} showCount rows={2} placeholder="可留空" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
