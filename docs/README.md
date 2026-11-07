# 文档索引

> 面向使用方的手册见下方「使用指南」；面向开发/验收的契约在 `contracts/`。
> GitHub Wiki 是同样的内容的镜像（入口在仓库右侧 Wiki 标签）。

## 使用指南（运维 / 最终用户）

| 文档 | 什么时候看 |
|---|---|
| [账号批量导入](./使用指南-账号批量导入.md) | 要一次性建几十到 500 个账号：CSV 格式、界面步骤、初始密码怎么分发、常见错误对照 |
| [证书替换与异地备份](./使用指南-证书替换与异地备份.md) | 要把自签证书换成正式证书；要把备份放到 NAS / 另一块盘（含权限坑与恢复演练） |

## 契约与验收（开发 / 交付）

| 文档 | 内容 |
|---|---|
| [contracts/openapi.yaml](./contracts/openapi.yaml) | 接口契约（OpenAPI 3.1，61 个操作 / 43 条路径） |
| [contracts/pages.md](./contracts/pages.md) | 页面组件树、字段、交互、状态 |
| [contracts/modules.md](./contracts/modules.md) | 15 个模块（12 active + 3 placeholder）与 config schema |
| [contracts/decisions.md](./contracts/decisions.md) | 已决策项 + 未决项 + 影响面（D-01 ~ D-22） |
| [contracts/acceptance.md](./contracts/acceptance.md) | 40 项验收清单 |
| [contracts/acceptance-report.md](./contracts/acceptance-report.md) | 验收逐条对账结果 |
| [contracts/perf-report.md](./contracts/perf-report.md) | 500 人规模实测报告 |

## 部署

见 [deploy/README.md](../deploy/README.md)：安装、nginx 两种形态、HTTPS、备份与恢复、
L1 双实例、L2 主从（当前规模不需要，留档）。

## 品牌与素材

- `brand/`：logo 各尺寸与横竖版（透明底），替换流程见 [brand/README.md](./brand/README.md)
- `examples/`：示例 CSV（账号导入）
- `screenshots/`：页面截图
