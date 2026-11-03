import { useEffect, useState } from 'react';
import { Alert, App as AntdApp, DatePicker, Form, Input, Modal } from 'antd';
import type { Dayjs } from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project } from '@workbench/shared/types';
import { createProject, projectsKeys, updateProject } from '../../api/projects';
import { errorText } from '../../api/messages';
import { parseDateOnly, toDateOnly } from '../../utils/datetime';

/**
 * 项目表单弹窗 —— pages.md §4 的 ProjectFormModal（新建 / 编辑共用）。
 *
 * 字段口径（v2 §6.1 / 执行包 §6.5）：
 * - name 必填 1 至 128；
 * - owner 可空，最长 64；
 * - dueDate 可空，YYYY-MM-DD（只到日，不带时间）。
 */

export interface ProjectFormValues {
  name?: string;
  owner?: string;
  dueDate?: Dayjs | null;
}

interface ProjectFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** 编辑目标；新建时为空 */
  project?: Project | null;
  onClose: () => void;
}

export function ProjectFormModal({ open, mode, project, onClose }: ProjectFormModalProps) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<ProjectFormValues>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    form.resetFields();
    if (mode === 'edit' && project) {
      form.setFieldsValue({
        name: project.name,
        owner: project.owner ?? '',
        dueDate: parseDateOnly(project.dueDate),
      });
    } else {
      form.setFieldsValue({ name: '', owner: '', dueDate: null });
    }
  }, [open, mode, project, form]);

  const mutation = useMutation({
    mutationFn: async (values: ProjectFormValues) => {
      const name = (values.name ?? '').trim();
      const owner = (values.owner ?? '').trim();
      const dueDate = toDateOnly(values.dueDate);
      if (mode === 'create') {
        return createProject({ name, owner: owner || null, dueDate });
      }
      // 编辑态一定有 project；兜底 0 会得到服务端 404「项目不存在」
      const id = project?.id ?? 0;
      return updateProject(id, { name, owner: owner || null, dueDate });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: projectsKeys.all });
      void message.success(mode === 'create' ? '项目已创建' : '已保存');
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
        mutation.mutate(values);
      })
      .catch(() => {
        // 字段级校验错误由 Form 自己展示
      });
  };

  return (
    <Modal
      open={open}
      title={mode === 'create' ? '新建项目' : '编辑项目'}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={mutation.isPending}
      okText="保存"
      cancelText="取消"
      maskClosable={false}
    >
      <Form<ProjectFormValues> form={form} layout="vertical" requiredMark>
        {error ? (
          <Alert className="wb-form-alert" type="error" showIcon message={error} />
        ) : null}

        <Form.Item
          name="name"
          label="项目名称"
          rules={[
            { required: true, message: '请输入项目名称' },
            { max: 128, message: '项目名称不能超过 128 个字符' },
            { whitespace: true, message: '项目名称不能全为空格' },
          ]}
        >
          <Input autoComplete="off" placeholder="请输入项目名称" maxLength={128} showCount />
        </Form.Item>

        <Form.Item
          name="owner"
          label="负责人"
          rules={[{ max: 64, message: '负责人不能超过 64 个字符' }]}
        >
          <Input autoComplete="off" placeholder="可留空" maxLength={64} />
        </Form.Item>

        <Form.Item name="dueDate" label="截止日">
          <DatePicker
            style={{ width: '100%' }}
            placeholder="不设置截止日"
            format="YYYY-MM-DD"
            allowClear
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
