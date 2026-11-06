import { useEffect, useState } from 'react';
import { Alert, App as AntdApp, Checkbox, Form, Input, Modal, Select } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Announcement, Project } from '@blackhole/shared/types';
import { createAnnouncement, teamKeys, updateAnnouncement } from '../../api/team';
import { errorText } from '../../api/messages';

/**
 * 团队公告表单弹窗 —— 用户端「团队协作」页（稿子图6）的「团队公告」面板。
 *
 * 字段口径（apps/api/src/team/routes.ts 的 zod schema）：
 * - title 必填 1 至 128；
 * - content 可空，最长 8000；
 * - pinned 置顶（列表里排最前）；
 * - projectId 可空 —— 空 = 全局公告（不挂项目）。
 *
 * ⚠️ 服务端 PUT /api/announcements/:id 用 COALESCE 更新字段：
 *    - title / content / pinned 传了才改（传 null 不改）；
 *    - projectId 传了才改，传 null = 清空归属项目。
 *    所以编辑时表单要**显式带上** projectId（含 null），否则改不掉归属。
 */

export interface AnnouncementFormValues {
  title?: string;
  content?: string;
  pinned?: boolean;
  projectId?: number | null;
}

interface AnnouncementFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** 编辑目标；新建时为空 */
  announcement?: Announcement | null;
  /** 可归属的项目 */
  projects?: Project[];
  onClose: () => void;
}

export function AnnouncementFormModal({
  open,
  mode,
  announcement = null,
  projects = [],
  onClose,
}: AnnouncementFormModalProps) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<AnnouncementFormValues>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    form.resetFields();
    if (mode === 'edit' && announcement) {
      form.setFieldsValue({
        title: announcement.title,
        content: announcement.content,
        pinned: announcement.pinned,
        projectId: announcement.projectId,
      });
    } else {
      form.setFieldsValue({
        title: '',
        content: '',
        pinned: false,
        projectId: null,
      });
    }
  }, [open, mode, announcement, form]);

  const mutation = useMutation({
    mutationFn: async (values: AnnouncementFormValues) => {
      const payload = {
        title: (values.title ?? '').trim(),
        content: values.content ?? '',
        pinned: values.pinned ?? false,
        // 编辑态显式带 projectId（含 null）—— 服务端据此决定改 / 清空归属
        projectId: values.projectId ?? null,
      };
      if (mode === 'create') return createAnnouncement(payload);
      // 编辑态一定有 announcement；兜底 0 会得到服务端 404「公告不存在」
      return updateAnnouncement(announcement?.id ?? 0, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: teamKeys.announcementRoot });
      void message.success(mode === 'create' ? '公告已发布' : '已保存');
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
    form
      .validateFields()
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
      title={mode === 'create' ? '发布团队公告' : '编辑团队公告'}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={mutation.isPending}
      okText="保存"
      cancelText="取消"
      maskClosable={false}
      width={640}
    >
      <Form<AnnouncementFormValues> form={form} layout="vertical" requiredMark>
        {error ? (
          <Alert className="wb-form-alert" type="error" showIcon message={error} />
        ) : null}

        <Form.Item
          name="title"
          label="标题"
          rules={[
            { required: true, message: '请输入标题' },
            { max: 128, message: '标题不能超过 128 个字符' },
            { whitespace: true, message: '标题不能全为空格' },
          ]}
        >
          <Input
            autoComplete="off"
            placeholder="请输入公告标题"
            maxLength={128}
            showCount
          />
        </Form.Item>

        <Form.Item name="content" label="内容">
          <Input.TextArea
            autoComplete="off"
            placeholder="补充公告正文（可空）"
            maxLength={8000}
            showCount
            rows={5}
          />
        </Form.Item>

        <Form.Item name="projectId" label="所属项目">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="不归属项目（全员可见）"
            options={projects.map((project) => ({ value: project.id, label: project.name }))}
          />
        </Form.Item>

        <Form.Item
          name="pinned"
          valuePropName="checked"
          style={{ marginBottom: 0 }}
        >
          <Checkbox>置顶这条公告</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}
