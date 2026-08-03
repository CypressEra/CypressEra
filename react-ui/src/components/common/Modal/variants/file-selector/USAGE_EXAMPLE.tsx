/**
 * File Selector Modal Usage Examples
 * 
 * This file demonstrates various ways to use the FileSelectorModal component.
 * Copy and adapt these examples for your use case.
 */

import React, { useState } from 'react';
import { useDialog, DIALOG_IDS, FileSelectorModal } from '@/components/common';
import type { FileItem } from '@/components/common';

// Example 1: Basic usage with dialog system
export function BasicFileSelectorExample() {
  const { openDialog } = useDialog();

  const handleOpenFileSelector = () => {
    openDialog(DIALOG_IDS.FILE_SELECTOR, FileSelectorModal, {
      title: 'Select a File',
      onSelect: (file: FileItem) => {
        console.log('Selected file:', file);
        alert(`Selected: ${file.name}`);
      },
      defaultFiles: [
        { name: 'Documents', type: 'folder', path: '/Documents' },
        { name: 'Images', type: 'folder', path: '/Images' },
        { name: 'report.pdf', type: 'file', path: '/Documents/report.pdf', size: 1024000 },
        { name: 'photo.jpg', type: 'file', path: '/Images/photo.jpg', size: 2048000 },
      ],
    });
  };

  return (
    <button onClick={handleOpenFileSelector}>
      Select File
    </button>
  );
}

// Example 2: Multiple file selection
export function MultipleFileSelectorExample() {
  const { openDialog } = useDialog();

  const handleSelectMultiple = () => {
    openDialog(DIALOG_IDS.FILE_SELECTOR, FileSelectorModal, {
      title: 'Select Multiple Files',
      allowMultiple: true,
      onSelectMultiple: (files: FileItem[]) => {
        console.log('Selected files:', files);
        alert(`Selected ${files.length} files`);
      },
      defaultFiles: [
        { name: 'file1.txt', type: 'file', path: '/file1.txt', size: 1024 },
        { name: 'file2.txt', type: 'file', path: '/file2.txt', size: 2048 },
        { name: 'file3.txt', type: 'file', path: '/file3.txt', size: 3072 },
      ],
    });
  };

  return (
    <button onClick={handleSelectMultiple}>
      Select Multiple Files
    </button>
  );
}

// Example 3: With file filtering (only PDFs)
export function FilteredFileSelectorExample() {
  const { openDialog } = useDialog();

  const handleSelectPDF = () => {
    openDialog(DIALOG_IDS.FILE_SELECTOR, FileSelectorModal, {
      title: 'Select PDF Document',
      fileFilter: (file: FileItem) => {
        // Always show folders
        if (file.type === 'folder') return true;
        // Only show PDF files
        return file.name.toLowerCase().endsWith('.pdf');
      },
      onSelect: (file: FileItem) => {
        console.log('Selected PDF:', file);
      },
      defaultFiles: [
        { name: 'Documents', type: 'folder', path: '/Documents' },
        { name: 'report.pdf', type: 'file', path: '/Documents/report.pdf', size: 1024000 },
        { name: 'image.png', type: 'file', path: '/Documents/image.png', size: 2048000 }, // Will be filtered out
      ],
    });
  };

  return (
    <button onClick={handleSelectPDF}>
      Select PDF
    </button>
  );
}

// Example 4: With custom file system provider (API integration)
export function APIFileSelectorExample() {
  const { openDialog } = useDialog();

  // Custom file system provider that fetches from API
  const getFilesFromAPI = async (path: string): Promise<FileItem[]> => {
    try {
      const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      if (!response.ok) throw new Error('Failed to fetch files');
      
      const data = await response.json();
      return data.files.map((file: any) => ({
        name: file.name,
        type: file.isDirectory ? 'folder' : 'file',
        path: file.path,
        size: file.size,
        modified: file.modified ? new Date(file.modified) : undefined,
      }));
    } catch (error) {
      console.error('Error fetching files:', error);
      return [];
    }
  };

  const handleSelectFromAPI = () => {
    openDialog(DIALOG_IDS.FILE_SELECTOR, FileSelectorModal, {
      title: 'Select File from Server',
      getFiles: getFilesFromAPI,
      initialPath: '/user/documents',
      onSelect: (file: FileItem) => {
        console.log('Selected from API:', file);
      },
    });
  };

  return (
    <button onClick={handleSelectFromAPI}>
      Select from Server
    </button>
  );
}

// Example 5: Direct usage (without dialog system)
export function DirectUsageExample() {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (file: FileItem) => {
    console.log('Selected:', file);
    setIsOpen(false);
  };

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Open File Selector
      </button>
      <FileSelectorModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSelect={handleSelect}
        title="Choose a File"
        defaultFiles={[
          { name: 'example.txt', type: 'file', path: '/example.txt', size: 1024 },
        ]}
      />
    </>
  );
}

// Example 6: Complex folder structure
export function ComplexFolderStructureExample() {
  const { openDialog } = useDialog();

  const complexFileStructure: FileItem[] = [
    // Root level
    { name: 'Documents', type: 'folder', path: '/Documents' },
    { name: 'Images', type: 'folder', path: '/Images' },
    { name: 'Videos', type: 'folder', path: '/Videos' },
    
    // Documents folder
    { name: 'Projects', type: 'folder', path: '/Documents/Projects' },
    { name: 'Reports', type: 'folder', path: '/Documents/Reports' },
    { name: 'report-2024.pdf', type: 'file', path: '/Documents/report-2024.pdf', size: 1024000 },
    
    // Documents/Projects folder
    { name: 'ProjectA', type: 'folder', path: '/Documents/Projects/ProjectA' },
    { name: 'ProjectB', type: 'folder', path: '/Documents/Projects/ProjectB' },
    { name: 'readme.md', type: 'file', path: '/Documents/Projects/readme.md', size: 2048 },
    
    // Images folder
    { name: 'Vacation', type: 'folder', path: '/Images/Vacation' },
    { name: 'photo1.jpg', type: 'file', path: '/Images/photo1.jpg', size: 2048000 },
    { name: 'photo2.jpg', type: 'file', path: '/Images/photo2.jpg', size: 3072000 },
  ];

  const handleSelect = () => {
    openDialog(DIALOG_IDS.FILE_SELECTOR, FileSelectorModal, {
      title: 'Browse Files',
      defaultFiles: complexFileStructure,
      initialPath: '/Documents',
      onSelect: (file: FileItem) => {
        console.log('Selected:', file.path);
      },
    });
  };

  return (
    <button onClick={handleSelect}>
      Browse Complex Structure
    </button>
  );
}

