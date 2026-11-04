import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntdApp, DatePicker, Form, Input, Modal, Radio, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Risk, RiskLevel } from '@workbench/shared/types';
import type { RiskKind } from '../../api/risks';
import { createRisk, riskKeys, updateRisk } from '../../api/risks';
import { errorText } from '../../api/messages';
import { parseDateOnly, toDateOnly } from '../../utils/datetime';
import { toProjectOptions } from '../../hooks/useProjectOptions';
import type { Project, UserListItem } from '@workbench/shared/types';

/**
 * 风险 / 问题表单弹窗 —— 用户端「风险问题管理」页（稿子图8）。
 *
 * 字段口径（apps/api/src/risks/routes.ts 的 zod schema）：
 * - title 必填 1 至 256；
 * - kind 风险 risk / 问题 issue，新建默认 risk；
 * - level / impact / probability 都是 low / medium / high；
 * - dueDate 是**日历日** YYYY-MM-DD（服务端用正则强制）；
 * - code / description / responsePlan 可空；
 * - projectId / ownerId 可空（服务端按归属人建档，非本人看不到）。
 *
 * 编辑态走 PUT /api/risks/:id（可同时改 status），
 * 新建态走 POST /api/risks（status 由服务端固定为 open）。
 */

export interface RiskFormValues {
  title?: string;
  kind?: RiskKind;
  code?: string | null;
  level?: RiskLevel;
  impact?: RiskLevel | null;
  probability?: RiskLevel | null;
  projectId?: number | null;
  ownerId?: number | null;
  dueDate?: Dayjs | null;
  description?: string | null;
  responsePlan?: string | null;
}

interface RiskFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** 编辑目标；新建时为空 */
  risk?: Risk | null;
  /** 可选项目（已按归属人过滤） */
  projects?: Project[];
  /** 可选负责人 */
  owners?: UserListItem[];
  onClose: () => void;
}

const LEVEL_OPTIONS: Array<{ value: RiskLevel; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
];

export function RiskFormModal({
  open,
  mode,
  risk,
  projects = [],
  owners = [],
  onClose,
}: RiskFormModalProps) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<RiskFormValues>();
  const [error, setError] = useState<string | null>(null);

  const projectOptions = useMemo(
    () => toProjectOptions(projects, projects[0]?.userId),
    [projects],
  );

  const ownerOptions = useMemo(
    () => owners.map((owner) => ({ value: owner.id, label: owner.name })),
    [owners],
  );

  useEffect(() => {
    if (!open) return;
    setError(null);
    form.resetFields();
    if (mode === 'edit' && risk) {
      form.setFieldsValue({
        title: risk.title,
        kind: risk.kind,
        code: risk.code,
        level: risk.level,
        impact: risk.impact,
        probability: risk.probability,
        projectId: risk.projectId,
        ownerId: risk.ownerId,
        dueDate: parseDateOnly(risk.dueDate),
        description: risk.description,
        responsePlan: risk.responsePlan,
      });
    } else {
      form.setFieldsValue({
        title: '',
        kind: 'risk',
        code: null,
        level: 'medium',
        impact: 'medium',
        probability: 'medium',
        projectId: null,
        ownerId: null,
        dueDate: null,
        description: null,
        responsePlan: null,
      });
    }
  }, [open, mode, risk, form]);

  const mutation = useMutation({
    mutationFn: async (values: RiskFormValues) => {
      const title = (values.title ?? '').trim();
      const payload = {
        title,
        kind: values.kind ?? 'risk',
        code: values.code ?? null,
        level: values.level ?? 'medium',
        impact: values.impact ?? null,
        probability: values.probability ?? null,
        projectId: values.projectId ?? null,
        ownerId: values.ownerId ?? null,
        dueDate: toDateOnly(values.dueDate),
        description: values.description ?? null,
        responsePlan: values.responsePlan ?? null,
      };
      if (mode === 'create') return createRisk(payload);
      // 编辑态一定有 risk；兜底 0 会得到服务端 404「风险不存在」
      return updateRisk(risk?.id ?? 0, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: riskKeys.all });
      void message.success(mode === 'create' ? '风险已创建' : '已保存');
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
      title={mode === 'create' ? '新建风险/问题' : '编辑风险/问题'}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={mutation.isPending}
      okText="保存"
      cancelText="取消"
      maskClosable={false}
      width={640}
    >
      <Form<RiskFormValues> form={form} layout="vertical" requiredMark>
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
          <Input autoComplete="off" placeholder="请输入风险或问题标题" maxLength={256} showCount />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="kind" label="类型" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid">
              <Radio value="risk">风险</Radio>
              <Radio value="issue">问题</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item name="level" label="风险等级" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid">
              <Radio value="low">低</Radio>
              <Radio value="medium">中</Radio>
              <Radio value="high">高</Radio>
            </Radio.Group>
          </Form.Item>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="impact" label="影响度">
            <Select allowClear options={LEVEL_OPTIONS} placeholder="未评估" />
          </Form.Item>
          <Form.Item name="probability" label="发生概率">
            <Select allowClear options={LEVEL_OPTIONS} placeholder="未评估" />
          </Form.Item>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="projectId" label="所属项目">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="不归属任何项目"
              options={projectOptions}
            />
          </Form.Item>
          <Form.Item name="ownerId" label="负责人">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="暂不指派"
              options={ownerOptions}
            />
          </Form.Item>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Form.Item name="code" label="编号">
            <Input autoComplete="off" placeholder="如 R-001" maxLength={32} />
          </Form.Item>
          <Form.Item name="dueDate" label="截止日期">
            <DatePicker
              style={{ width: '100%' }}
              placeholder="不设置截止日期"
              format="YYYY-MM-DD"
              allowClear
            />
          </Form.Item>
        </div>

        <Form.Item name="description" label="描述">
          <Input.TextArea
            autoComplete="off"
            placeholder="补充风险/问题的背景与影响（可空）"
            maxLength={4000}
            showCount
            rows={3}
          />
        </Form.Item>

        <Form.Item name="responsePlan" label="应对措施">
          <Input.TextArea
            autoComplete="off"
            placeholder="写下应对计划（可空）"
            maxLength={4000}
            showCount
            rows={3}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
