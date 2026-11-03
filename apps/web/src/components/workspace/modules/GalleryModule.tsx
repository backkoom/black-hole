import { ModuleEmpty } from './ModuleShell';
import { readGalleryImages } from './config';

/**
 * 图片墙模块 —— §7.5：读 config 的 images，九宫格展示，caption 可空。
 *
 * 安全：schema 只允许 https，这里再兜底一次：非 https 的图片不渲染。
 */
export function GalleryModule({ config }: { config: Record<string, unknown> }) {
  const images = readGalleryImages(config).filter((image) => /^https:\/\//i.test(image.url));
  if (images.length === 0) return <ModuleEmpty text="还没有图片" />;

  return (
    <div className="wb-gallery">
      {images.map((image) => (
        <figure className="wb-gallery-item" key={image.url}>
          <img src={image.url} alt={image.caption || '图片'} loading="lazy" />
          {image.caption ? <figcaption>{image.caption}</figcaption> : null}
        </figure>
      ))}
    </div>
  );
}
