import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, X, Check, AlertCircle, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { api } from '../../lib/api';
import { themeClasses } from '../../lib/themeClasses';

interface CSVImportModalProps {
  onClose: () => void;
}

export function CSVImportModal({ onClose }: CSVImportModalProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'processing'>('upload');
  const [csvFile, setCSVFile] = useState<File | null>(null);
  const [csvContent, setCSVContent] = useState('');
  const [sessionId, setSessionId] = useState<string>('');
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const queryClient = useQueryClient();

  const downloadTemplateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.get('/api/v1/import/template', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'asset-template.csv');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    },
    onError: () => toast.error('Failed to download template'),
  });

  const validateMutation = useMutation({
    mutationFn: async () => {
      if (!csvContent) {
        throw new Error('No CSV content');
      }
      const response = await api.post('/api/v1/import/validate', {
        filename: csvFile?.name || 'import.csv',
        csv_content: csvContent,
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        setSessionId(data.data.session_id);
        setPreviewData(data.data.preview);
        setErrors(data.data.errors);
        setStep('preview');
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to validate CSV');
    },
  });

  const processMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/api/v1/import/process', {
        session_id: sessionId,
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(
          `Import completed: ${data.data.successful_rows} assets created, ${data.data.failed_rows} failed`
        );
        queryClient.invalidateQueries({ queryKey: ['assets'] });
        setStep('processing');
        setTimeout(() => onClose(), 2000);
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to process CSV');
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file');
      return;
    }

    setCSVFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setCSVContent(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={clsx('rounded-lg shadow-xl w-full max-w-2xl mx-4', themeClasses.bg.card)}>
        {/* Header */}
        <div className={clsx('px-6 py-4 border-b', themeClasses.border.primary, 'flex justify-between items-center')}>
          <h2 className={clsx('text-lg font-semibold', themeClasses.text.primary)}>
            {step === 'upload' && 'Import Assets from CSV'}
            {step === 'preview' && 'Review Import Preview'}
            {step === 'processing' && 'Processing Import'}
          </h2>
          <button onClick={onClose} className={themeClasses.text.secondary} disabled={processMutation.isPending}>
            ✕
          </button>
        </div>

        {/* Content */}
        <div className={clsx('px-6 py-6', 'max-h-96 overflow-y-auto')}>
          {step === 'upload' && (
            <div className="space-y-6">
              <div>
                <p className={clsx('text-sm mb-4', themeClasses.text.secondary)}>
                  Upload a CSV file to bulk import assets. Download the template below to see the required format.
                </p>

                {/* Download Template Button */}
                <button
                  onClick={() => downloadTemplateMutation.mutate()}
                  disabled={downloadTemplateMutation.isPending}
                  className={clsx('flex items-center gap-2 px-4 py-2 rounded text-sm font-medium mb-4', themeClasses.bg.secondary, themeClasses.text.primary, 'hover:bg-opacity-80')}
                >
                  <Download size={16} />
                  {downloadTemplateMutation.isPending ? 'Downloading...' : 'Download Template'}
                </button>
              </div>

              {/* File Upload Area */}
              <div
                className={clsx(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  csvFile
                    ? 'border-green-500 bg-green-50 dark:bg-green-900 dark:border-green-400'
                    : clsx(themeClasses.border.secondary, 'hover:border-opacity-80'),
                  !csvFile && 'hover:bg-opacity-50'
                )}
              >
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                  id="csv-file-input"
                />
                <label htmlFor="csv-file-input" className="cursor-pointer block">
                  {csvFile ? (
                    <div className="space-y-2">
                      <Check size={32} className={clsx('mx-auto', 'text-green-600 dark:text-green-400')} />
                      <p className={clsx('font-medium', themeClasses.text.primary)}>{csvFile.name}</p>
                      <p className={clsx('text-xs', themeClasses.text.secondary)}>Click to change</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload size={32} className={clsx('mx-auto', themeClasses.text.secondary)} />
                      <p className={clsx('font-medium', themeClasses.text.primary)}>Drop your CSV file here</p>
                      <p className={clsx('text-xs', themeClasses.text.secondary)}>or click to select</p>
                    </div>
                  )}
                </label>
              </div>

              {csvFile && (
                <p className={clsx('text-xs', themeClasses.text.secondary)}>
                  File size: {(csvFile.size / 1024).toFixed(2)} KB
                </p>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {errors.length > 0 && (
                <div className={clsx('p-3 rounded', 'bg-red-50 dark:bg-red-900', 'border border-red-200 dark:border-red-700')}>
                  <div className="flex gap-2">
                    <AlertCircle size={16} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-800 dark:text-red-200">Validation Errors</p>
                      <ul className="text-xs text-red-700 dark:text-red-300 mt-1 space-y-1">
                        {errors.slice(0, 5).map((err, idx) => (
                          <li key={idx}>
                            Row {err.row}: {err.message}
                          </li>
                        ))}
                        {errors.length > 5 && <li>...and {errors.length - 5} more errors</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {previewData.length > 0 && (
                <div className="space-y-2">
                  <p className={clsx('text-sm font-medium', themeClasses.text.primary)}>
                    Preview ({previewData.length} of {previewData.length} rows will be imported)
                  </p>
                  <div className={clsx('rounded border overflow-x-auto', themeClasses.border.primary)}>
                    <table className="w-full text-xs">
                      <thead className={themeClasses.bg.secondary}>
                        <tr>
                          {Object.keys(previewData[0] || {})
                            .slice(0, 5)
                            .map((key) => (
                              <th key={key} className={clsx('px-3 py-2 text-left font-medium', themeClasses.text.primary)}>
                                {key}
                              </th>
                            ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.slice(0, 3).map((row, idx) => (
                          <tr key={idx} className={clsx('border-t', themeClasses.border.primary)}>
                            {Object.entries(row)
                              .slice(0, 5)
                              .map(([_key, value]) => (
                                <td key={_key} className={clsx('px-3 py-2', themeClasses.text.secondary)}>
                                  {String(value || '—').substring(0, 30)}
                                </td>
                              ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'processing' && (
            <div className="text-center space-y-4">
              <Check size={48} className="mx-auto text-green-600 dark:text-green-400" />
              <p className={clsx('font-medium', themeClasses.text.primary)}>Import completed successfully!</p>
              <p className={clsx('text-sm', themeClasses.text.secondary)}>Redirecting to assets...</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={clsx('px-6 py-4 border-t', themeClasses.border.primary, 'flex gap-3 justify-end')}>
          {step === 'upload' && (
            <>
              <button
                onClick={onClose}
                className={clsx('px-4 py-2 rounded text-sm font-medium', themeClasses.bg.tertiary, themeClasses.text.primary)}
              >
                Cancel
              </button>
              <button
                onClick={() => validateMutation.mutate()}
                disabled={!csvContent || validateMutation.isPending}
                className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}
              >
                {validateMutation.isPending ? 'Validating...' : 'Next: Review'}
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => setStep('upload')}
                className={clsx('px-4 py-2 rounded text-sm font-medium', themeClasses.bg.tertiary, themeClasses.text.primary)}
              >
                Back
              </button>
              <button
                onClick={() => processMutation.mutate()}
                disabled={errors.length > 0 || processMutation.isPending}
                className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary, 'disabled:opacity-50')}
              >
                {processMutation.isPending ? 'Importing...' : 'Import Assets'}
              </button>
            </>
          )}

          {step === 'processing' && (
            <button
              onClick={onClose}
              className={clsx('px-4 py-2 rounded text-sm font-medium text-white', themeClasses.button.primary)}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
