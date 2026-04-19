'use client';

import { useCallback, useState, useRef } from 'react';
import { parsePortfolioAppraisal } from '@/lib/parser';
import type { Portfolio } from '@/lib/types';

export function FileUpload({
  onPortfolioLoaded,
}: {
  onPortfolioLoaded: (portfolio: Portfolio) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsLoading(true);

      try {
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(
            'File exceeds 5MB limit. Try exporting just your holdings.'
          );
        }

        if (
          !file.name.endsWith('.xlsx') &&
          !file.name.endsWith('.xls')
        ) {
          throw new Error(
            'Please upload an XLSX file (Portfolio Appraisal format).'
          );
        }

        const buffer = await file.arrayBuffer();
        const portfolio = parsePortfolioAppraisal(buffer);

        if (portfolio.sectors.length === 0) {
          throw new Error(
            "No sectors found in file. Make sure this is a Portfolio Appraisal XLSX."
          );
        }

        onPortfolioLoaded(portfolio);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to parse file.');
      } finally {
        setIsLoading(false);
      }
    },
    [onPortfolioLoaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center w-full p-8 sm:p-12 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          isDragging
            ? 'border-accent bg-accent-light'
            : 'border-border hover:border-accent hover:bg-accent-light/50'
        }`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileInput}
          className="hidden"
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-text-muted mb-3"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {isLoading ? (
          <p className="text-sm text-text-muted">Parsing file...</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-text">
              Drop your Portfolio Appraisal XLSX here
            </p>
            <p className="text-xs text-text-muted mt-1">
              or click to browse (max 5MB)
            </p>
          </>
        )}
      </div>
      {error && (
        <div className="mt-3 p-3 rounded-md border border-loss/30 bg-loss/5 text-sm text-loss">
          {error}
        </div>
      )}
    </div>
  );
}
