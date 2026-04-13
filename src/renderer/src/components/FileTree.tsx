import { useState, useCallback } from 'react';
import { useAppStore } from '../store';
import { useRPC } from '../hooks/useRPC';
import type { FileTreeNode } from '../types';
import { formatBytes } from '../utils/format';

interface FileTreeProps {
  nodes: FileTreeNode[];
}

export function FileTree({ nodes }: FileTreeProps) {
  return (
    <div style={{ overflow: 'auto', flex: 1, fontSize: 12 }}>
      {nodes.map((node) => (
        <TreeNode key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}

function TreeNode({ node, depth }: { node: FileTreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const { setSelectedDatabase, setScreen, setPlistView, databases } = useAppStore();
  const { getFileContent, getPlistContent } = useRPC();

  const handleClick = useCallback(async () => {
    if (node.isDirectory) {
      setExpanded((e) => !e);
      return;
    }

    if (node.fileType === 'database' && node.fileId) {
      const db = databases.find((d) => d.fileId === node.fileId);
      if (db) {
        setSelectedDatabase(db);
        setScreen('explorer');
      }
    } else if (node.fileType === 'plist' && node.fileId) {
      try {
        const result = (await getPlistContent(node.fileId)) as { data: unknown };
        setPlistView(node.fileId, result.data);
      } catch {
        // Handle error silently
      }
    }
  }, [node, databases, setSelectedDatabase, setScreen, setPlistView, getPlistContent, getFileContent]);

  const icon = node.isDirectory ? (expanded ? '📂' : '📁') :
    node.fileType === 'database' ? '🗄' :
    node.fileType === 'plist' ? '⚙' :
    node.fileType === 'image' ? '🖼' : '📄';

  return (
    <div>
      <div
        onClick={handleClick}
        style={{
          padding: '2px 8px 2px ' + (12 + depth * 16) + 'px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseOut={(e) => (e.currentTarget.style.background = '')}
      >
        <span style={{ fontSize: 10, width: 14, textAlign: 'center' }}>
          {node.isDirectory ? (expanded ? '▼' : '▶') : ' '}
        </span>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {node.name}
        </span>
        {node.size > 0 && !node.isDirectory && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {formatBytes(node.size)}
          </span>
        )}
      </div>
      {expanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
