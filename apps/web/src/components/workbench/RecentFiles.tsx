import { Button } from 'antd';
import { FileOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { listFiles } from '../../api/files';
import { formatBytes } from '../../utils/format';
import { formatDateOnly } from '../../utils/datetime';
import { StateBlock } from '../user/StateBlock';

/**
 * 「文件资料」工作台模块（D-32）—— 老六的规划里工作台要有这一块。
 *
 * 只取最近 6 个文件（接口不分页，前端切片），点条目直接进文件页；
 * 不在工作台做上传/下载/版本这些重操作，那是文件页的事。
 */
export function RecentFiles(): JSX.Element {
  const navigate = useNavigate();
  const filesQuery = useQuery({
    queryKey: ['workbench', 'files'],
    queryFn: () => listFiles(),
    staleTime: 60_000,
  });

  const files = [...(filesQuery.data ?? [])]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 6);

  return (
    <div className="wb-file-block">
      <div className="wb-today-head">
        <span className="wb-today-title">
          最近文件
          <span className="wb-today-count">{files.length}</span>
        </span>
        <Button type="link" size="small" onClick={() => void navigate('/files')}>
          全部文件
        </Button>
      </div>
      <StateBlock
        loading={filesQuery.isPending}
        error={filesQuery.isError ? filesQuery.error : undefined}
        onRetry={() => void filesQuery.refetch()}
        isEmpty={files.length === 0}
        emptyText="还没有文件"
        emptyHint="去文件资料页上传"
      >
        <ul className="wb-file-list">
          {files.map((file) => (
            <li key={file.id}>
              <button type="button" className="wb-file-row" onClick={() => void navigate('/files')}>
                <FileOutlined className="wb-file-icon-sm" />
                <span className="wb-file-name" title={file.name}>
                  {file.name}
                </span>
                <span className="wb-file-meta">
                  {formatBytes(file.sizeBytes)} · {formatDateOnly(file.updatedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </StateBlock>
    </div>
  );
}
