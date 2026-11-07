import { useEffect, useState } from 'react';
import { App as AntdApp, Button, Descriptions, Form, Input, InputNumber, Switch, Tag } from 'antd';
import { CloudServerOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/ui';
import { StateBlock } from '../components/user/StateBlock';
import { errorText } from '../api/messages';
import { fetchSystemSettings, systemKeys, updateBackupSettings } from '../api/system';
import { useAuth } from '../auth/AuthContext';
import { formatBytes } from '../utils/format';
import '../styles/files.css';

/**
 * 系统设置（D-22）—— 设置页里原来"太空"的三块。
 *
 * 1. 备份：目录 / 保留份数 / 是否启用 —— **可在线改**，存数据库，备份脚本下次运行就生效
 * 2. 文件存储：目录 / 单文件上限 / 已用容量 —— 只读（改要动环境变量并重启）
 * 3. HTTPS 证书：当前安装的证书信息 —— 只读，证书由使用方自备
 *
 * 权限：面板对管理员可见；**改备份只有超级管理员能保存**（服务端再校验一次）。
 */
export function SystemSettingsPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [form] = Form.useForm<{ dir: string; keep: number; enabled: boolean }>();
  const [dirty, setDirty] = useState(false);

  const settingsQuery = useQuery({
    queryKey: systemKeys.settings,
    queryFn: fetchSystemSettings,
    staleTime: 15_000,
  });

  const settings = settingsQuery.data;
  const canEdit = Boolean(user?.isSuper);

  // 数据回来后灌进表单（只在未编辑时覆盖，避免把用户正在改的内容冲掉）
  useEffect(() => {
    if (settings && !dirty) {
      form.setFieldsValue({
        dir: settings.backup.dir,
        keep: settings.backup.keep,
        enabled: settings.backup.enabled,
      });
    }
  }, [settings, dirty, form]);

  const saveMutation = useMutation({
    mutationFn: (values: { dir: string; keep: number; enabled: boolean }) =>
      updateBackupSettings({ ...values, source: settings?.backup.source ?? 'env' }),
    onSuccess: async () => {
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: systemKeys.settings });
      void message.success('备份设置已保存，下次定时备份生效（不用重启）');
    },
    onError: (err) => void message.error(errorText(err)),
  });

  const tls = settings?.tls;
  const certTone = !tls?.found ? 'default' : (tls.daysLeft ?? 0) < 30 ? 'orange' : 'green';

  return (
    <div className="wb-page">
      <PageHeader
        title="系统设置"
        subtitle="备份、文件存储与证书。备份配置改完即时生效，其余项需要改环境变量并重启服务"
        showMeta={false}
      />

      <StateBlock
        loading={settingsQuery.isPending}
        error={settingsQuery.isError ? settingsQuery.error : undefined}
        onRetry={() => void settingsQuery.refetch()}
        isEmpty={false}
      >
        {/* 备份 */}
        <Panel
          title="备份"
          extra={
            <Button
              type="primary"
              loading={saveMutation.isPending}
              disabled={!canEdit || !dirty}
              onClick={() => void form.submit()}
            >
              保存
            </Button>
          }
        >
          <Form
            form={form}
            layout="vertical"
            style={{ maxWidth: 560 }}
            onValuesChange={() => setDirty(true)}
            onFinish={(values) => saveMutation.mutate(values)}
          >
            <Form.Item
              label="备份目录"
              name="dir"
              rules={[
                { required: true, message: '请填写备份目录' },
                {
                  pattern: /^\//,
                  message: '必须是绝对路径（以 / 开头），例如 /data/backups/blackhole',
                },
              ]}
              extra="可以是本地目录，也可以是已挂载的 NAS 路径。⚠️ 用 NAS 前先确认已挂载（df -h），否则会静默写到本地盘。"
            >
              <Input placeholder="/data/backups/blackhole" disabled={!canEdit} />
            </Form.Item>
            <Form.Item
              label="保留份数"
              name="keep"
              rules={[{ required: true, message: '请填写保留份数' }]}
              extra="按时间戳目录算，超出删最旧的。每天备份一次的话，14 份约等于两周。"
            >
              <InputNumber min={1} max={365} style={{ width: 160 }} disabled={!canEdit} />
            </Form.Item>
            <Form.Item
              label="启用定时备份"
              name="enabled"
              valuePropName="checked"
              extra="关闭后定时任务会直接跳过（不报错）。手工备份不受影响。"
            >
              <Switch disabled={!canEdit} />
            </Form.Item>
          </Form>
          {!canEdit ? (
            <div className="wb-form-hint">只有超级管理员可以修改备份设置。</div>
          ) : null}
        </Panel>

        <div style={{ height: 16 }} />

        {/* 文件存储 */}
        <Panel title="文件存储" extra={<CloudServerOutlined style={{ color: '#94a3b8' }} />}>
          <Descriptions
            column={1}
            size="small"
            items={[
              {
                key: 'dir',
                label: '存储目录',
                children: <code>{settings?.storage.dir ?? '—'}</code>,
              },
              {
                key: 'max',
                label: '单文件上限',
                children: `${settings?.storage.maxUploadMb ?? '—'} MB`,
              },
              {
                key: 'used',
                label: '已用容量',
                children: (
                  <span>
                    {formatBytes(settings?.storage.usedBytes ?? 0)}
                    <span className="wb-muted">（{settings?.storage.fileCount ?? 0} 个文件）</span>
                  </span>
                ),
              },
            ]}
          />
          <div className="wb-form-hint">
            改存储目录或上限要动环境变量 <code>FILE_STORAGE_DIR</code> /{' '}
            <code>MAX_UPLOAD_MB</code> 并重启服务；这里只做展示。
          </div>
        </Panel>

        <div style={{ height: 16 }} />

        {/* 证书 */}
        <Panel
          title="HTTPS 证书"
          extra={<SafetyCertificateOutlined style={{ color: '#94a3b8' }} />}
        >
          {tls?.found ? (
            <>
              <Descriptions
                column={1}
                size="small"
                items={[
                  { key: 'path', label: '证书文件', children: <code>{tls.path}</code> },
                  { key: 'subject', label: '主题', children: tls.subject ?? '—' },
                  { key: 'issuer', label: '颁发者', children: tls.issuer ?? '—' },
                  {
                    key: 'valid',
                    label: '有效期',
                    children: (
                      <span>
                        {tls.validFrom} → {tls.validTo}{' '}
                        <Tag color={certTone}>
                          {(tls.daysLeft ?? 0) < 0
                            ? `已过期 ${Math.abs(tls.daysLeft ?? 0)} 天`
                            : `剩余 ${tls.daysLeft} 天`}
                        </Tag>
                      </span>
                    ),
                  },
                  {
                    key: 'sans',
                    label: 'SAN',
                    children: (tls.sans ?? []).join('、') || '—',
                  },
                ]}
              />
              <div className="wb-form-hint">
                证书由使用方自备。替换时把新的 <code>.crt</code> / <code>.key</code> 放到{' '}
                <code>/etc/nginx/ssl/</code>，执行 <code>nginx -t &amp;&amp; systemctl reload nginx</code>。
              </div>
            </>
          ) : (
            <div className="wb-form-hint">
              没有读到证书（{tls?.path}）。当前可能是自签或纯 HTTP——内网验收可以接受，
              正式使用请换成使用方提供的证书。
            </div>
          )}
        </Panel>

        <div style={{ height: 16 }} />

        {/* 版本 */}
        <Panel title="版本">
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: 'release', label: '构建', children: settings?.version.release ?? '开发模式' },
              { key: 'node', label: 'Node', children: settings?.version.node ?? '—' },
            ]}
          />
        </Panel>
      </StateBlock>
    </div>
  );
}
