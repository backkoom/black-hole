import { useEffect, useState } from 'react';
import { Alert, App as AntdApp, Form, Input, Modal, Radio, Select } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Role, User, UserListItem, UserStatus } from '@blackhole/shared/types';
import { apiPost, apiPut } from '../api/client';
import { errorText } from '../api/messages';
import { orgKeys } from '../api/org';
import { usersKeys } from '../api/users';
import { useAuth } from '../auth/AuthContext';

/**
 * 账号表单弹窗 —— 新增 / 编辑共用（pages.md §8 的 UserFormModal）。
 *
 * 权限口径：
 * - `role` 控件只有超管可见可用；管理员表单不显示 role，请求体也不带 role；
 * - 本人（编辑自己）只能改姓名：部门 / 状态 / 角色禁用，请求体只带 name（服务端也会 403）；
 * - 服务端错误文案原样显示在表单顶部，不改写。
 */

/** 账号规则：4 至 32 位，字母开头，仅含字母、数字和下划线（执行包 §6.5）。 */
const ACCOUNT_RULE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

export interface UserFormValues {
  account?: string;
  name?: string;
  orgId?: number;
  role?: Role;
  status?: UserStatus;
}

interface UserFormModalProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** 编辑目标；新增时为空 */
  target?: UserListItem | null;
  /** 部门下拉选项（路径名） */
  orgOptions: { value: number; label: string }[];
  /** 新增时的默认部门（组织架构页从当前节点带过来） */
  defaultOrgId?: number;
  onClose: () => void;
  /** 新增成功：把一次性初始密码交给外层弹窗展示 */
  onCreated?: (user: User, initialPassword: string) => void;
}

export function UserFormModal({
  open,
  mode,
  target,
  orgOptions,
  defaultOrgId,
  onClose,
  onCreated,
}: UserFormModalProps) {
  const { message } = AntdApp.useApp();
  const { user: actor } = useAuth();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<UserFormValues>();
  const [error, setError] = useState<string | null>(null);

  const isSuper = actor?.isSuper ?? false;
  const isSelf = mode === 'edit' && target !== null && target !== undefined && target.id === actor?.id;
  /** 本人编辑时只允许改姓名（字段禁用 + 请求体不带其他字段） */
  const onlyName = isSelf;

  useEffect(() => {
    if (!open) return;
    setError(null);
    form.resetFields();
    if (mode === 'edit' && target) {
      form.setFieldsValue({
        account: target.account,
        name: target.name,
        orgId: target.orgId,
        role: target.role,
        status: target.status,
      });
    } else {
      form.setFieldsValue({ role: 'user', status: 'active', orgId: defaultOrgId });
    }
  }, [open, mode, target, defaultOrgId, form]);

  const mutation = useMutation({
    mutationFn: async (
      values: UserFormValues,
    ): Promise<{ user: User; initialPassword?: string }> => {
      if (mode === 'create') {
        const account = (values.account ?? '').trim().toLowerCase();
        const name = (values.name ?? '').trim();
        // 表单已做必填校验；这里的兜底只会走到服务端 400/422
        const orgId = values.orgId ?? 0;
        // 管理员不显示 role 控件，请求体也不带 role（服务端默认普通用户）
        const payload: { account: string; name: string; orgId: number; role?: Role } = {
          account,
          name,
          orgId,
        };
        if (isSuper && values.role) payload.role = values.role;
        const data = await apiPost<{ user: User; initialPassword: string }>('/users', payload);
        return { user: data.user, initialPassword: data.initialPassword };
      }
      // 编辑态一定有 target；兜底 0 会得到服务端 404「用户不存在」
      const id = target?.id ?? 0;
      const name = (values.name ?? '').trim();
      // 本人：只带 name（服务端 D-01 严格校验，带其他字段一律 403）
      if (onlyName) {
        const data = await apiPut<{ user: User }>(`/users/${id}`, { name });
        return { user: data.user };
      }
      const payload: { name?: string; orgId?: number; status?: UserStatus; role?: Role } = {};
      if (name) payload.name = name;
      if (values.orgId !== undefined) payload.orgId = values.orgId;
      if (values.status) payload.status = values.status;
      if (isSuper && values.role) payload.role = values.role;
      const data = await apiPut<{ user: User }>(`/users/${id}`, payload);
      return { user: data.user };
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: usersKeys.list });
      await queryClient.invalidateQueries({ queryKey: orgKeys.tree });
      if (mode === 'create') {
        void message.success('账号已创建');
        onClose();
        if (data.initialPassword) onCreated?.(data.user, data.initialPassword);
        return;
      }
      void message.success('已保存');
      onClose();
    },
    onError: (err) => {
      // 服务端 422（账号已存在 / 部门不是末级节点）文案原样展示
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
      title={mode === 'create' ? '新增账号' : '编辑账号'}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={mutation.isPending}
      okText="保存"
      cancelText="取消"
      maskClosable={false}
    >
      <Form<UserFormValues> form={form} layout="vertical" requiredMark>
        {error ? (
          <Alert className="wb-form-alert" type="error" showIcon message={error} />
        ) : null}

        <Form.Item
          name="account"
          label="账号"
          rules={
            mode === 'create'
              ? [
                  { required: true, message: '请输入账号' },
                  {
                    pattern: ACCOUNT_RULE,
                    message: '账号为 4-32 位，字母开头，仅含字母、数字和下划线',
                  },
                ]
              : undefined
          }
        >
          <Input
            autoComplete="off"
            disabled={mode === 'edit'}
            placeholder={mode === 'create' ? '请输入账号' : undefined}
          />
        </Form.Item>

        <Form.Item
          name="name"
          label="姓名"
          rules={[
            { required: true, message: '请输入姓名' },
            { max: 64, message: '姓名不能超过 64 个字符' },
          ]}
        >
          <Input autoComplete="off" placeholder="请输入姓名" />
        </Form.Item>

        <Form.Item
          name="orgId"
          label="部门"
          rules={[{ required: true, message: '请选择部门' }]}
          extra={mode === 'edit' && onlyName ? undefined : '人员只能挂在末级节点（没有下级的节点）上'}
        >
          <Select
            showSearch
            allowClear
            optionFilterProp="label"
            placeholder="请选择部门"
            disabled={onlyName}
            options={orgOptions}
          />
        </Form.Item>

        {mode === 'create' ? null : (
          <Form.Item name="status" label="状态">
            <Radio.Group disabled={onlyName} optionType="button" buttonStyle="solid">
              <Radio value="active">在职</Radio>
              <Radio value="disabled">已停用</Radio>
            </Radio.Group>
          </Form.Item>
        )}

        {isSuper ? (
          <Form.Item
            name="role"
            label="角色"
            extra={
              target?.isSuper
                ? '超级管理员的角色不能改为普通用户'
                : '只有超级管理员可以设置管理员角色'
            }
          >
            <Select
              disabled={onlyName}
              options={[
                {
                  value: 'user',
                  label: '普通用户',
                  // 超管账号的角色不可降级（服务端同样拒绝）
                  disabled: target?.isSuper === true,
                },
                { value: 'admin', label: '管理员' },
              ]}
            />
          </Form.Item>
        ) : null}

        {onlyName ? (
          <Alert
            className="wb-form-alert"
            type="info"
            showIcon
            message="只能修改本人的姓名，部门、状态与角色不可修改。"
          />
        ) : null}
      </Form>
    </Modal>
  );
}
