/**
 * File-selector category descriptors.
 *
 * Single source of truth for the user-file library categories shown in
 * FileSelectorModal: the case / reference libraries (Models, Knowledge) and the
 * study-file inputs (.sub / .mon / .con). Each category id doubles as the
 * api-server `file_type`.
 */

/** User-file library categories; the value is also the api-server `file_type`. */
export type UserFileType = 'model' | 'knowledge' | 'sub' | 'mon' | 'con' | 'diagram';

export interface FileCategory {
  /** Category id; also the api-server `file_type`. */
  id: UserFileType;
  /** Virtual root path in the picker (e.g. '/Model'). */
  rootPath: string;
  /** i18n key for the sidebar label. */
  labelKey: string;
  /** Sidebar icon asset. */
  icon: string;
  /** Per-file icon asset. */
  fileIcon: string;
  /** Allowed file extensions (lowercase, leading dot). Empty means any file. */
  extensions: string[];
}

export const FILE_CATEGORIES: FileCategory[] = [
  {
    id: 'model',
    rootPath: '/Model',
    labelKey: 'fileSelector.model',
    icon: '/folder.png',
    fileIcon: '/model.png',
    extensions: ['.rawx'],
  },
  {
    id: 'knowledge',
    rootPath: '/Knowledge',
    labelKey: 'fileSelector.knowledge',
    icon: '/folder.png',
    fileIcon: '/file.png',
    extensions: [],
  },
  {
    id: 'sub',
    rootPath: '/Subsystem',
    labelKey: 'fileSelector.subsystem',
    icon: '/folder.png',
    fileIcon: '/file.png',
    extensions: ['.sub'],
  },
  {
    id: 'mon',
    rootPath: '/Monitor',
    labelKey: 'fileSelector.monitor',
    icon: '/folder.png',
    fileIcon: '/file.png',
    extensions: ['.mon'],
  },
  {
    id: 'con',
    rootPath: '/Contingency',
    labelKey: 'fileSelector.contingency',
    icon: '/folder.png',
    fileIcon: '/file.png',
    extensions: ['.con'],
  },
  {
    id: 'diagram',
    rootPath: '/Diagram',
    labelKey: 'fileSelector.diagram',
    icon: '/folder.png',
    fileIcon: '/file.png',
    extensions: ['.cyd', '.cyd.gz', '.cyd.json'],
  },
];

/** Categories shown by default in FileSelectorModal — the case + reference + diagram libraries. */
export const DEFAULT_FILE_CATEGORIES: FileCategory[] = FILE_CATEGORIES.filter(
  (c) => c.id === 'model' || c.id === 'knowledge' || c.id === 'diagram',
);

/** Study-file categories — the .sub / .mon / .con analysis inputs. */
export const STUDY_FILE_CATEGORIES: FileCategory[] = FILE_CATEGORIES.filter(
  (c) => c.id === 'sub' || c.id === 'mon' || c.id === 'con',
);

/** Resolve the category that owns a picker path (its root or any descendant). */
export const getCategoryByPath = (path: string): FileCategory | undefined => {
  if (!path) return undefined;
  const norm = path.startsWith('/') ? path : `/${path}`;
  return FILE_CATEGORIES.find(
    (c) => norm === c.rootPath || norm.startsWith(`${c.rootPath}/`),
  );
};

/** Resolve a category by its id (`file_type`). */
export const getCategoryById = (id: string): FileCategory | undefined =>
  FILE_CATEGORIES.find((c) => c.id === id);

/** True when `fileName` matches the category's allowed extensions (any when empty). */
export const matchesCategory = (fileName: string, category: FileCategory): boolean => {
  if (category.extensions.length === 0) return true;
  const lower = fileName.toLowerCase();
  return category.extensions.some((ext) => lower.endsWith(ext));
};
