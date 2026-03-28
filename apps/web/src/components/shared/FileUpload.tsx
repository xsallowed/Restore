import { useState, useRef, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Upload, X, CheckCircle2, AlertTriangle, File } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface UploadedFile {
  name: string;
  size: number;
  status: 'uploading' | 'scanning' | 'done' | 'error' | 'quarantined';
  progress: number;
  error?: string;
}

interface FileUploadProps {
  eventId: string;
  stepId: string;
  onUploaded?: () => void;
}

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/csv',
  'application/json', 'application/zip',
];

const MAX_SIZE_MB = 50;

export function FileUpload({ eventId, stepId, onUploaded }: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: async ({ file, name }: { file: File; name: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('evidenceType', 'FILE');
      formData.append('title', name);

      return api.post(`/events/${eventId}/steps/${stepId}/evidence/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          const pct = Math.round(((e.loaded || 0) / (e.total || 1)) * 100);
          setFiles(prev => prev.map(f => f.name === name ? { ...f, progress: pct, status: pct < 100 ? 'uploading' : 'scanning' } : f));
        },
      });
    },
    onError: (_err, { name }) => {
      setFiles(prev => prev.map(f => f.name === name ? { ...f, status: 'error', error: 'Upload failed' } : f));
      toast.error(`Failed to upload ${name}`);
    },
    onSuccess: (_data, { name }) => {
      setFiles(prev => prev.map(f => f.name === name ? { ...f, status: 'done', progress: 100 } : f));
      toast.success(`${name} uploaded`);
      onUploaded?.();
    },
  });

  const processFile = useCallback((file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(`${file.name}: file type not allowed`);
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast.error(`${file.name}: exceeds ${MAX_SIZE_MB}MB limit`);
      return;
    }
    setFiles(prev => [...prev, { name: file.name, size: file.size, status: 'uploading', progress: 0 }]);
    uploadMutation.mutate({ file, name: file.name });
  }, [uploadMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    Array.from(e.dataTransfer.files).forEach(processFile);
  }, [processFile]);

  const formatSize = (bytes: number) => bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)}KB`
    : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

  const STATUS_ICON: Record<string, React.ReactNode> = {
    uploading:   <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />,
    scanning:    <div className="w-3.5 h-3.5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />,
    done:        <CheckCircle2 size={14} className="text-green-500" />,
    error:       <AlertTriangle size={14} className="text-red-500" />,
    quarantined: <AlertTriangle size={14} className="text-orange-500" />,
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
          isDragging ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={ALLOWED_TYPES.join(',')}
          onChange={e => Array.from(e.target.files || []).forEach(processFile)}
        />
        <Upload size={20} className={clsx('mx-auto mb-2', isDragging ? 'text-brand-500' : 'text-gray-300')} />
        <p className={clsx('text-sm font-medium', isDragging ? 'text-brand-700' : 'text-gray-500')}>
          {isDragging ? 'Drop files here' : 'Drag files here or click to browse'}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Images, PDFs, logs, JSON, ZIP — max {MAX_SIZE_MB}MB each
        </p>
      </div>

      {/* Upload list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2.5">
              <File size={15} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-700 truncate">{file.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{formatSize(file.size)}</span>
                </div>
                {(file.status === 'uploading' || file.status === 'scanning') && (
                  <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${file.progress}%`,
                        background: file.status === 'scanning' ? '#eab308' : '#3b82f6',
                      }}
                    />
                  </div>
                )}
                {file.status === 'scanning' && (
                  <p className="text-xs text-yellow-600 mt-0.5">Scanning for threats…</p>
                )}
                {file.status === 'quarantined' && (
                  <p className="text-xs text-orange-600 mt-0.5">File quarantined — potential threat detected</p>
                )}
                {file.error && (
                  <p className="text-xs text-red-500 mt-0.5">{file.error}</p>
                )}
              </div>
              <div className="shrink-0">{STATUS_ICON[file.status]}</div>
              {(file.status === 'done' || file.status === 'error') && (
                <button onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))} className="shrink-0 text-gray-300 hover:text-gray-500">
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
