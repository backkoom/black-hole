import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntdApp, DatePicker, Form, Input, Modal, Radio, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Priority, Project, Task } from '@workbench/shared/types';
import { createTask, tasksKeys, updateTask } from '../../api/tasks';
import { errorText } from '../../api/messages';
import { parseDateOnly, toDateOnly } from '../../utils/datetime';
import { toProjectOptions } from '../../hooks/useProjectOptions';

/**
 * 任务表单弹窗 —— pages.md §3 的 TaskFormModal（新增 / 编辑共用）。
 *
 * 字段口径（v2 §5.1 / 执行包 §6.5）：
 * - title 必填 1 至 256；
 * - priority 三值，新建默认 medium；
 * - dueDate 可空，YYYY-MM-DD（只到日，不带时间）；
 * - projectId 可空 —— 新建时必须属于当前登录用户，编辑时按**任务归属人**校验，
 *   所以项目下拉按 ownerUserId 过滤（服务端按归属人校验 project_id）。
 *
 * 项目详情页内嵌时（showProjectField=false）不展示项目字段，
 * 直接沿用该任务所属的项目（v2 §5.2「内嵌任务字段同任务管理」不含 project_id）。
 */

export interface TaskFormValues {
  title?: string;
  projectId?: number | null;
  priority?: Priority;
  dueDate?: Dayjs | null;
}

interface TaskFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** 编辑目标；新增时为空 */
  task?: Task | null;
  /** 可选项目（已按归属人过滤）；showProjectField=false 时不需要传 */
  projects?: Project[];
  /** 项目归属人：服务端按它校验 project_id */
  ownerUserId?: number;
  /** 新建时的默认项目 */
  defaultProjectId?: number | null;
  /** 是否展示「所属项目」字段（项目详情页内嵌时为 false） */
  showProjectField?: boolean;
  onClose: () => void;
}

export function TaskFormModal({
  open,
  mode,
  task,
  projects,
  ownerUserId,
  defaultProjectId,
  showProjectField = true,
  onClose,
}: TaskFormModalProps) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<TaskFormValues>();
  const [error, setError] = useState<string | null>(null);

  const projectOptions = useMemo(
    () => toProjectOptions(projects, ownerUserId),
    [projects, ownerUserId],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    form.resetFields();
    if (mode === 'edit' && task) {
      form.setFieldsValue({
        title: task.title,
        projectId: task.projectId,
        priority: task.priority,
        dueDate: parseDateOnly(task.dueDate),
      });
    } else {
      form.setFieldsValue({
        title: '',
        projectId: defaultProjectId ?? undefined,
        priority: 'medium',
        dueDate: null,
      });
    }
  }, [open, mode, task, defaultProjectId, form]);

  const mutation = useMutation({
    mutationFn: async (values: TaskFormValues) => {
      const title = (values.title ?? '').trim();
      const priority = values.priority ?? 'medium';
      const dueDate = toDateOnly(values.dueDate);
      if (mode === 'create') {
        const projectId = showProjectField
          ? values.projectId ?? null
          : defaultProjectId ?? null;
        return createTask({ title, projectId, priority, dueDate });
      }
      // 编辑态一定有 task；兜底 0 会得到服务端 404「任务不存在」
      const id = task?.id ?? 0;
      const projectId = showProjectField
        ? values.projectId ?? null
        : task?.projectId ?? null;
      return updateTask(id, { title, projectId, priority, dueDate });
    },
    onSuccess: async () => {
      // 任务变了 → 项目进度/状态也会变，两个列表都要刷新（v2 §6.2「实时算，不依赖缓存」）
      await queryClient.invalidateQueries({ queryKey: tasksKeys.all });
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      void message.success(mode === 'create' ? '任务已创建' : '已保存');
      onClose();
    },
    onError: (err) => {
      // 服务端 422（项目不存在或不属于任务归属人）文案原样展示
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
      title={mode === 'create' ? '新增任务' : '编辑任务'}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={mutation.isPending}
      okText="保存"
      cancelText="取消"
      maskClosable={false}
    >
      <Form<TaskFormValues> form={form} layout="vertical" requiredMark>
        {error ? (
          <Alert className="wb-form-alert" type="error" showIcon message={error} />
        ) : null}

        <Form.Item
          name="title"
          label="标题"
          rules={[
            { required: true, message: '请输入标题' },
            { max: 256, message: '标题不能超过 256 个字符' },
            { whitespace: true, message: '标题不能全为空格' },
          ]}
        >
          <Input autoComplete="off" placeholder="请输入标题" maxLength={256} showCount />
        </Form.Item>

        {showProjectField ? (
          <Form.Item name="projectId" label="所属项目">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="不归属任何项目"
              options={projectOptions}
            />
          </Form.Item>
        ) : null}

        <Form.Item name="priority" label="优先级" rules={[{ required: true }]}>
          <Radio.Group optionType="button" buttonStyle="solid">
            <Radio value="low">低</Radio>
            <Radio value="medium">中</Radio>
            <Radio value="high">高</Radio>
          </Radio.Group>
        </Form.Item>

        <Form.Item name="dueDate" label="到期日">
          <DatePicker
            style={{ width: '100%' }}
            placeholder="不设置到期日"
            format="YYYY-MM-DD"
            allowClear
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
