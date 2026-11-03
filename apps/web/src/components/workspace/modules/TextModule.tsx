import { ModuleEmpty } from './ModuleShell';
import { readTextConfig } from './config';

/**
 * 文本卡片模块 —— §7.5：读 config 的 title + body，**纯文本**渲染（不解释 HTML）。
 */
export function TextModule({ config }: { config: Record<string, unknown> }) {
  const { title, body } = readTextConfig(config);
  if (!title && !body) return <ModuleEmpty text="点击编辑文本" />;

  return (
    <div className="wb-text-module">
      {title ? <div className="wb-text-title">{title}</div> : null}
      {body ? <div className="wb-text-body">{body}</div> : null}
    </div>
  );
}
