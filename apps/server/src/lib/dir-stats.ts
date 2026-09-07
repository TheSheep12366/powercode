import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface DirStats {
  files: number;
  bytes: number;
  lines: number;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', 'out', '.svn', 'target', '__pycache__', '.idea', '.vscode']);
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_ENTRIES = 30000;
const MAX_DEPTH = 15;

/** 递归统计目录：文件数 / 体积 / 代码行数（跳过隐藏目录、依赖目录与二进制/超大文件） */
export function computeDirStats(absPath: string): DirStats {
  let files = 0;
  let bytes = 0;
  let lines = 0;
  let visited = 0;

  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH || visited > MAX_ENTRIES) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited++ > MAX_ENTRIES) return;
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (entry.isFile()) {
          const st = statSync(full);
          files += 1;
          bytes += st.size;
          if (st.size > 0 && st.size <= MAX_FILE_SIZE) {
            const buf = readFileSync(full);
            if (!buf.includes(0)) {
              lines += buf.toString('utf8').split('\n').length;
            }
          }
        }
      } catch {
        // 单个文件统计失败不影响整体
      }
    }
  };

  walk(absPath, 0);
  return { files, bytes, lines };
}
