BEGIN;

-- 清理旧业务数据（测试库）
DELETE FROM notification;
DELETE FROM task;
DELETE FROM milestone;
DELETE FROM risk;
DELETE FROM meeting;
DELETE FROM idea;
DELETE FROM project_member;
DELETE FROM project;

-- ===================== 项目 =====================
INSERT INTO project (user_id, name, owner, phase, start_date, due_date, created_at, updated_at)
VALUES
  (1,'2026 年度信息化建设','陈贵刚','年度规划','2026-01-05','2026-12-31', now(), now()),
  (1,'MES 二期推广','陈贵刚','执行中','2026-09-01','2026-12-31', now(), now()),
  (1,'网络安全加固专项','陈贵刚','验收中','2026-10-08','2026-11-30', now(), now()),
  (1,'数据中台试点','王磊','规划中','2026-11-01','2027-03-31', now(), now());

-- ===================== 里程碑 =====================
INSERT INTO milestone (project_id, user_id, name, due_date, status, sort, created_at, updated_at)
SELECT p.id, 1, m.name, m.due::date, m.status, m.sort, now(), now()
FROM (VALUES
  ('MES 二期推广','产线数据联调完成','2026-11-15','done',1),
  ('MES 二期推广','二期正式上线','2026-12-20','pending',2),
  ('网络安全加固专项','等保测评通过','2026-11-10','done',1),
  ('网络安全加固专项','整改闭环验收','2026-11-28','pending',2),
  ('数据中台试点','需求调研完成','2026-11-22','pending',1),
  ('数据中台试点','POC 验证通过','2026-12-15','pending',2),
  ('2026 年度信息化建设','年度预算确认','2026-11-30','pending',1),
  ('2026 年度信息化建设','年度总结归档','2026-12-31','pending',2)
) AS m(pname, name, due, status, sort)
JOIN project p ON p.name = m.pname;

-- ===================== 父任务（月度 / 周计划） =====================
INSERT INTO task (user_id, project_id, title, status, priority, due_date, done_at, category, created_at, updated_at)
SELECT 1, p.id, t.title, t.status, t.prio, t.due::date,
       CASE WHEN t.status = 'done'
            THEN (t.due::date + time '18:00') AT TIME ZONE 'Asia/Shanghai'
            ELSE NULL END,
       t.cat, now(), now()
FROM (VALUES
  ('MES 二期推广','产线数据采集点位核对','done','high','2026-10-22','周计划'),
  ('MES 二期推广','工单接口联调','doing','high','2026-11-20','周计划'),
  ('MES 二期推广','车间终端部署','todo','medium','2026-11-25','周计划'),
  ('网络安全加固专项','漏洞扫描与整改','done','high','2026-11-05','周计划'),
  ('网络安全加固专项','主机加固','doing','high','2026-11-15','周计划'),
  ('网络安全加固专项','等保测评准备','todo','medium','2026-11-28','周计划'),
  ('数据中台试点','需求调研','doing','medium','2026-11-22','周计划'),
  ('数据中台试点','POC 验证','todo','medium','2026-12-05','周计划'),
  ('2026 年度信息化建设','2027 年度预算编制','doing','high','2026-11-30','月度'),
  ('2026 年度信息化建设','供应商年度评估','todo','low','2026-12-10','月度')
) AS t(pname, title, status, prio, due, cat)
JOIN project p ON p.name = t.pname;

-- ===================== 子任务（日常） =====================
INSERT INTO task (user_id, project_id, title, status, priority, due_date, done_at, category, parent_id, assignee_id, created_at, updated_at)
SELECT 1, pt.project_id, c.title, c.status, c.prio, c.due::date,
       CASE WHEN c.status = 'done'
            THEN (c.due::date + time '17:30') AT TIME ZONE 'Asia/Shanghai'
            ELSE NULL END,
       '日常', pt.id, c.assignee, now(), now()
FROM (VALUES
  ('产线数据采集点位核对','一号线设备清单确认','done','high','2026-10-20',3),
  ('产线数据采集点位核对','二号线 PLC 点位复核','done','high','2026-10-21',4),
  ('产线数据采集点位核对','采集网关选型比价','done','medium','2026-10-22',3),
  ('工单接口联调','工单下发接口测试','doing','high','2026-11-17',3),
  ('工单接口联调','报工回传接口联调','todo','high','2026-11-19',4),
  ('工单接口联调','异常工单处理验证','todo','medium','2026-11-20',3),
  ('车间终端部署','终端到货验收','todo','medium','2026-11-21',5),
  ('车间终端部署','车间网络点位勘察','todo','medium','2026-11-22',4),
  ('漏洞扫描与整改','高危漏洞修复','done','high','2026-11-03',3),
  ('漏洞扫描与整改','中危漏洞复核','done','medium','2026-11-04',4),
  ('主机加固','SSH 与账号策略加固','done','high','2026-11-10',3),
  ('主机加固','审计日志与告警配置','doing','high','2026-11-14',4),
  ('等保测评准备','测评资料收集','todo','medium','2026-11-25',5),
  ('需求调研','业务部门访谈（生产/质量）','done','medium','2026-11-12',3),
  ('需求调研','数据源梳理','doing','medium','2026-11-18',6),
  ('POC 验证','POC 环境准备','todo','medium','2026-11-28',5),
  ('POC 验证','指标口径确认','todo','medium','2026-12-02',6),
  ('2027 年度预算编制','各条线预算需求收集','doing','high','2026-11-16',5),
  ('2027 年度预算编制','供应商报价对比','todo','medium','2026-11-24',3),
  ('供应商年度评估','评估表发放与回收','todo','low','2026-12-05',4),
  ('供应商年度评估','现场考察安排','todo','low','2026-12-08',6)
) AS c(ptitle, title, status, prio, due, assignee)
JOIN task pt ON pt.title = c.ptitle AND pt.parent_id IS NULL;

-- ===================== 风险 / 问题 =====================
INSERT INTO risk (project_id, user_id, code, kind, title, description, level, impact, probability, status, owner_id, due_date, response_plan, created_at, updated_at)
SELECT p.id, 1, r.code, r.kind, r.title, r.descr, r.level, r.impact, r.prob, r.status, 1, r.due::date, r.plan, now(), now()
FROM (VALUES
  ('MES 二期推广','MES-01','risk','供应商交付延期',
   '采集网关到货时间从 11-10 推迟到 11-21，影响车间终端部署窗口',
   'high','high','medium','open','2026-11-25','① 要求供应商书面承诺到货日期 ② 先用测试样机完成 1 条产线验证'),
  ('网络安全加固专项','SEC-01','risk','车间网络改造影响生产',
   '整改需要断网，生产部只给周末窗口，连续两周排期已满',
   'high','high','high','handling','2026-11-30','① 与生产部锁定 11-22 窗口 ② 变更方案做成可回滚，30 分钟内恢复'),
  ('网络安全加固专项','SEC-02','risk','等保整改工作量超预期',
   '初评发现 37 项不符合，原估 20 项，人力缺口约 1 人月',
   'medium','medium','high','open','2026-12-05','① 分批整改，先做高危 12 项 ② 申请外部测评机构辅导'),
  ('数据中台试点','DAT-01','issue','数据源口径不一致',
   'MES 与 ERP 的产量口径差 3%，影响指标可信度',
   'medium','high','medium','handling','2026-11-28','① 拉生产/财务/IT 三方对齐口径 ② 先出一版口径说明文档'),
  ('2026 年度信息化建设','ANN-01','risk','预算审批周期长',
   '2027 年预算需 12 月中旬上会，但条线需求 11 月底才能收齐',
   'low','medium','medium','open','2026-12-15','① 先报框架额度 ② 明细 12 月初补'),
  ('2026 年度信息化建设','ANN-02','issue','测试环境硬件故障',
   '工作台测试服务器主板损坏无法开机，原有数据丢失',
   'high','high','high','resolved','2026-11-18','已在超融合上重建 Ubuntu 24.04 + 全新测试环境，11-18 恢复可用')
) AS r(pname, code, kind, title, descr, level, impact, prob, status, due, plan)
JOIN project p ON p.name = r.pname;

-- ===================== 随记 =====================
INSERT INTO idea (user_id, content, created_at, updated_at) VALUES
  (1,'11-04 周例会：MES 二期联调比计划落后 3 天，需协调供应商增派 1 人', '2026-11-04 11:00+08', now()),
  (1,'11-06 车间网络改造方案要再和生产部确认停机窗口，只能周末', '2026-11-06 16:20+08', now()),
  (1,'11-10 等保测评资料清单已下发，各条线 11-25 前交', '2026-11-10 09:40+08', now()),
  (1,'11-12 数据中台访谈：质量部希望先做不良率分析，优先级高于产量', '2026-11-12 15:10+08', now()),
  (1,'11-14 供应商 A 报价比去年涨 12%，采购说要谈但没底', '2026-11-14 10:30+08', now()),
  (1,'11-16 预算：安全条线追加 15 万，要单独写说明', '2026-11-16 14:05+08', now()),
  (1,'11-17 采集终端到货延到 11-21，车间部署计划整体顺延 3 天', '2026-11-17 17:20+08', now()),
  (1,'11-18 周例会准备：MES 联调进度、等保整改排期、测试环境重建说明', '2026-11-18 08:50+08', now());

-- ===================== 会议 =====================
INSERT INTO meeting (project_id, user_id, title, location, start_at, end_at, note, created_at, updated_at)
SELECT p.id, 1, m.title, m.loc, m.st::timestamptz, m.en::timestamptz, m.note, now(), now()
FROM (VALUES
  ('2026 年度信息化建设','信息化周例会（第 45 周）','行政楼 3F 会议室 A','2026-11-04 09:30+08','2026-11-04 10:30+08','MES 进度、安全整改排期'),
  ('2026 年度信息化建设','信息化周例会（第 46 周）','行政楼 3F 会议室 A','2026-11-11 09:30+08','2026-11-11 10:30+08','等保资料、预算初稿'),
  ('MES 二期推广','MES 二期联调评审','生产部 2F 小会议室','2026-11-14 14:00+08','2026-11-14 15:30+08','接口联调方案确认'),
  ('2026 年度信息化建设','信息化周例会（第 47 周）','行政楼 3F 会议室 A','2026-11-18 09:30+08','2026-11-18 10:30+08','三项议题：联调进度/整改排期/环境重建'),
  ('数据中台试点','数据中台需求对齐','线上（腾讯会议）','2026-11-18 15:00+08','2026-11-18 16:00+08','生产/质量/财务三方口径'),
  ('2026 年度信息化建设','11 月月度总结','行政楼 3F 会议室 A','2026-11-25 14:00+08','2026-11-25 16:00+08','月度复盘 + 下月计划')
) AS m(pname, title, loc, st, en, note)
JOIN project p ON p.name = m.pname;

COMMIT;

-- ===================== 结果核对 =====================
SELECT '项目' AS 表, count(*) AS 条数 FROM project
UNION ALL SELECT '里程碑', count(*) FROM milestone
UNION ALL SELECT '任务', count(*) FROM task
UNION ALL SELECT '  其中已完成', count(*) FROM task WHERE status='done'
UNION ALL SELECT '  其中进行中', count(*) FROM task WHERE status='doing'
UNION ALL SELECT '  其中待处理', count(*) FROM task WHERE status='todo'
UNION ALL SELECT '  已逾期', count(*) FROM task WHERE status<>'done' AND due_date < CURRENT_DATE
UNION ALL SELECT '风险', count(*) FROM risk
UNION ALL SELECT '随记', count(*) FROM idea
UNION ALL SELECT '会议', count(*) FROM meeting;
