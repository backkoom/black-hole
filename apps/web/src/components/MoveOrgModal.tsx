import { useEffect, useState } from 'react';
import { Alert, App as AntdApp, Form, Modal, Select } from 'antd';
import type { OrgNode } from '@blackhole/shared/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { orgKeys, updateOrg } from '../api/org';
import { errorText } from '../api/messages';

/**
 * 移动组织节点弹窗 —— pages.md §9 的 MoveModal。
 *
 * 候选上级已在前端排除「自身与子孙」（成环由服务端 422 兜底：不能移动到自己的子孙下）；
 * 根节点不可移动，服务端会返回「根节点不可移动」。
 */
interface MoveOrgModalProps {
  open: boolean;
  /** 被移动的节点 */
  node: OrgNode | null;
  /** 候选上级（已排除自身与子孙） */
  options: { value: number; label: string }[];
  onClose: () => void;
}

export function MoveOrgModal({ open, node, options, onClose }: MoveOrgModalProps) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ parentId?: number }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    form.resetFields();
    form.setFieldsValue({ parentId: node?.parentId ?? undefined });
  }, [open, node, form]);

  const mutation = useMutation({
    mutationFn: (parentId: number) => updateOrg(node?.id ?? 0, { parentId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgKeys.tree });
      void message.success('已移动');
      onClose();
    },
    onError: (err) => {
      const text = errorText(err);
      setError(text);
      void message.error(text);
    },
  });

  const handleOk = (): void => {
    setError(null);
    form.validateFields()
      .then((values) => {
        if (values.parentId === undefined) {
          setError('请选择新的上级节点');
          return;
        }
        mutation.mutate(values.parentId);
      })
      .catch(() => {
        // 字段级校验错误由 Form 展示
      });
  };

  return (
    <Modal
      open={open}
      title="移动节点"
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={mutation.isPending}
      okText="移动"
      cancelText="取消"
      maskClosable={false}
    >
      <Form form={form} layout="vertical" requiredMark>
        {error ? (
          <Alert className="wb-form-alert" type="error" showIcon message={error} />
        ) : null}

        <div className="wb-form-hint">
          当前节点：{node?.name ?? '—'}
          {node?.parentId === null ? '（根节点不可移动）' : ''}
        </div>

        <Form.Item
          name="parentId"
          label="新的上级节点"
          rules={[{ required: true, message: '请选择新的上级节点' }]}
          extra="不能选择自身或自己的子孙"
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="请选择新的上级节点"
            options={options}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
