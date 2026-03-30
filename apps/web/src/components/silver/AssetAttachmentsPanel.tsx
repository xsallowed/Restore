import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Download, Trash2, FileText, Image, File } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface Attachment {
  attachment_id: string;
  original_filename: string;
  file_size_bytes: number;
  mime_type: string;
  attachment_type: string;
  created_at: string;
}

const ATTACHMENT_TYPES = [
  { value: 'warranty', label: 'Warranty Document' },
  { value: 'purchase_order', label: 'Purchase Order' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'photo', label: 'Photo' },
  { value: 'other', label: 'Other' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <Image size={16} className="text-blue-500" />;
  if (mimeType === 'application/pdf') return <FileText size={16} className="text-red-500" />;
  return <File size={16} className="text-gray-500" />;
}

export function AssetAttachmentsPanel({ assetId }: { assetId: string }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentType, setAttachmentType] = useState('other');
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['asset-attachments', assetId],
    queryFn: () => api.get(`/api/v1/assets/${assetId}/attachments`).then((r) => r.data.data || []),
  });
  const attachments: Attachment[] = data || [];

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('attachment_type', attachmentType);
      await api.post(`/api/v1/assets/${assetId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('File uploaded successfully');
      queryClient.invalidateQueries({ queryKey: ['asset-attachments', assetId] });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

  const downloadAttachment = (att: Attachment) => {
    window.open(`/api/v1/assets/${assetId}/attachments/${att.attachment_id}/download`, '_blank');
  };

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <label className={clsx('block text-sm font-medium', themeClasses.text.primary)}>Attachment Type</label>
          <select
            value={attachmentType}
            onChange={(e) => setAttachmentType(e.target.value)}
            className={clsx('px-3 py-1.5 rounded border text-sm', themeClasses.bg.secondary, themeClasses.border.primary, themeClasses.text.primary)}
          >
            {ATTACHMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className={clsx(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition',
            'hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20',
            themeClasses.border.primary
          )}
        >
          <Upload size={24} className={clsx('mx-auto mb-2 opacity-50', themeClasses.text.secondary)} />
          <p className={clsx('text-sm font-medium', themeClasses.text.primary)}>
            {uploading ? 'Uploading…' : 'Drop file here or click to browse'}
          </p>
          <p className={clsx('text-xs mt-1', themeClasses.text.secondary)}>PDF, images, Word docs — max 25MB</p>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.xlsx,.xls,.csv,.txt" />
        </div>
      </div>

      {/* Attachment list */}
      {isLoading ? (
        <p className={clsx('text-sm', themeClasses.text.secondary)}>Loading attachments…</p>
      ) : attachments.length === 0 ? (
        <p className={clsx('text-sm text-center py-4', themeClasses.text.secondary)}>No attachments yet</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => (
            <div key={att.attachment_id} className={clsx('flex items-center gap-3 px-4 py-3 rounded-lg border', themeClasses.bg.secondary, themeClasses.border.primary)}>
              <FileIcon mimeType={att.mime_type} />
              <div className="flex-1 min-w-0">
                <p className={clsx('text-sm font-medium truncate', themeClasses.text.primary)}>{att.original_filename}</p>
                <p className={clsx('text-xs', themeClasses.text.secondary)}>
                  {ATTACHMENT_TYPES.find((t) => t.value === att.attachment_type)?.label || att.attachment_type}
                  {' · '}{formatBytes(att.file_size_bytes)}
                  {' · '}{new Date(att.created_at).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => downloadAttachment(att)}
                className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded text-xs', themeClasses.button.secondary)}>
                <Download size={12} /> Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
