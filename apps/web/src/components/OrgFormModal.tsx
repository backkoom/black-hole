import { useEffect, useState } from 'react';
import { Alert, App as AntdApp, Form, Input, Modal } from 'antd';
import type { OrgNode } from '@workbench/shared/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createOrg, orgKeys, updateOrg } from '../api/org';
import { errorText } from '../api/messages';

/**
 * 组织节点表单 —— 新增下级 / 重命名共用（pages.md §9 的 OrgFormModal）。
 *
 * 层级上限由服务端 MAX_ORG_LEVEL 控制，前端不写死；超限时服务端返回 422，
 * 这里把 message 原文显示在表单顶部，不改写。
 */
interface OrgFormModalProps {
  open: boolean;
  mode: 'create' | 'rename';
  /** 新增时的父节点 */
  parent?: OrgNode | null;
  /** 改名时的目标节点 */
  node?: OrgNode | null;
  onClose: () => void;
}

export function OrgFormModal({ open, mode, parent, node, onClose }: OrgFormModalProps) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ name?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    form.resetFields();
    form.setFieldsValue({ name: mode === 'rename' ? (node?.name ?? '') : '' });
  }, [open, mode, node, form]);

  const mutation = useMutation({
    mutationFn: async (name: string) => {
      if (mode === 'create') {
        // parent 为 null = 新增根节点（组织树为空时的起点）
        return createOrg({ parentId: parent?.id ?? null, name });
      }
      return updateOrg(node?.id ?? 0, { name });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgKeys.tree });
      void message.success(
        mode === 'create' ? (parent ? '已新增下级' : '已新增根节点') : '已重命名',
      );
      onClose();
    },
    onError: (err) => {
      // 服务端 422（重名 / 超过层级上限 / 末级约束）文案原样展示
      const text = errorText(err);
      setError(text);
      void message.error(text);
    },
  });

  const handleOk = (): void => {
    setError(null);
    form.validateFields()
      .then((values) => {
        const name = (values.name ?? '').trim();
        mutation.mutate(name);
      })
      .catch(() => {
        // 字段级校验错误由 Form 展示
      });
  };

  const parentHasUsers = mode === 'create' && (parent?.userCount ?? 0) > 0;

  return (
    <Modal
      open={open}
      title={mode === 'create' ? (parent ? '新增下级' : '新增根节点') : '重命名'}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={mutation.isPending}
      okText="保存"
      cancelText="取消"
      maskClosable={false}
    >
      <Form form={form} layout="vertical" requiredMark>
        {error ? (
          <Alert className="wb-form-alert" type="error" showIcon message={error} />
        ) : null}

        {parentHasUsers ? (
          <Alert
            className="wb-form-alert"
            type="warning"
            showIcon
            message="该节点下仍有人员，请先把人员移到新的末级节点后再新增下级。"
          />
        ) : null}

        <Form.Item
          name="name"
          label="名称"
          rules={[
            { required: true, message: '请输入名称' },
            { max: 64, message: '名称不能超过 64 个字符' },
            { whitespace: true, message: '名称不能全为空格' },
          ]}
        >
          <Input autoComplete="off" placeholder="请输入名称" maxLength={64} />
        </Form.Item>

        {mode === 'create' && parent ? (
          <div className="wb-form-hint">上级节点：{parent.name}</div>
        ) : null}
        {mode === 'create' && !parent ? (
          <div className="wb-form-hint">这是根节点（顶级组织），建好后再在它下面加下级。</div>
        ) : null}
      </Form>
    </Modal>
  );
}
