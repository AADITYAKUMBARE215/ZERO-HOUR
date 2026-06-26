import React from 'react';

interface MarkdownViewProps {
  content: string;
}

export default function MarkdownView({ content }: MarkdownViewProps) {
  if (!content) return null;

  // Split content by lines to parse basic Markdown blocks
  const lines = content.split('\n');

  return (
    <div className="space-y-3 text-slate-600 font-sans leading-relaxed text-sm">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // 1. Headers
        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={idx} className="text-lg font-bold text-slate-900 tracking-tight border-b border-slate-100 pb-1 mt-4">
              {trimmed.replace('# ', '')}
            </h1>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={idx} className="text-base font-semibold text-slate-800 tracking-tight mt-3">
              {trimmed.replace('## ', '')}
            </h2>
          );
        }
        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={idx} className="text-xs font-semibold text-blue-600 tracking-wider uppercase mt-3">
              {trimmed.replace('### ', '')}
            </h3>
          );
        }

        // 2. Bullet Points
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const text = trimmed.substring(2);
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-blue-500 mt-2 shrink-0 block w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              <p className="text-slate-650">{parseInlineStyles(text)}</p>
            </div>
          );
        }

        // 3. Numbers
        if (/^\d+\s*\.\s/.test(trimmed)) {
          const text = trimmed.replace(/^\d+\s*\.\s/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-slate-500 font-mono font-medium shrink-0">
                {trimmed.match(/^\d+/)![0]}.
              </span>
              <p className="text-slate-650">{parseInlineStyles(text)}</p>
            </div>
          );
        }

        // 4. Empty Line
        if (trimmed === '') {
          return <div key={idx} className="h-1" />;
        }

        // 5. Standard Paragraph
        return (
          <p key={idx} className="text-slate-650">
            {parseInlineStyles(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

// Simple parser for inline formatting like **bold**
function parseInlineStyles(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
