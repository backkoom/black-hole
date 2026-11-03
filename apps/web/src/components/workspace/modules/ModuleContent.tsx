import type { LayoutItem } from '@workbench/shared/types';
import { CalendarModule } from './CalendarModule';
import { DataChartModule } from './DataChartModule';
import { DividerModule } from './DividerModule';
import { EmbedModule } from './EmbedModule';
import { GalleryModule } from './GalleryModule';
import { IdeaModule } from './IdeaModule';
import { LinksModule } from './LinksModule';
import { NoticeModule } from './NoticeModule';
import { ProjectProgressModule } from './ProjectProgressModule';
import { QuickEntryModule } from './QuickEntryModule';
import { TextModule } from './TextModule';
import { TodoModule } from './TodoModule';

/**
 * 模块内容分发 —— 12 个 active 模块各有一个渲染器。
 *
 * - basic 模块（todo / project-progress / calendar / data-chart / idea）自己取数；
 * - content 模块（quick-entry / text / notice / links / embed / gallery / divider）只读 config。
 */
export function ModuleContent({ item }: { item: LayoutItem }) {
  switch (item.moduleKey) {
    case 'todo':
      return <TodoModule />;
    case 'project-progress':
      return <ProjectProgressModule />;
    case 'calendar':
      return <CalendarModule />;
    case 'data-chart':
      return <DataChartModule />;
    case 'idea':
      return <IdeaModule />;
    case 'quick-entry':
      return <QuickEntryModule config={item.config} />;
    case 'text':
      return <TextModule config={item.config} />;
    case 'notice':
      return <NoticeModule config={item.config} />;
    case 'links':
      return <LinksModule config={item.config} />;
    case 'embed':
      return <EmbedModule config={item.config} />;
    case 'gallery':
      return <GalleryModule config={item.config} />;
    case 'divider':
      return <DividerModule config={item.config} />;
    default:
      return null;
  }
}
