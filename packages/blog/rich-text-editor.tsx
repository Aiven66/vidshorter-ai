'use client';

/**
 * @clipop/blog - Rich Text Editor
 *
 * A minimal contentEditable-based rich text editor. No external dependencies
 * (no TipTap, no Quill, no react-paypal-js). Uses document.execCommand which
 * is deprecated but still works in all major browsers as of 2025.
 *
 * Toolbar actions: bold / italic / underline / H1 / H2 / link / bullet list /
 * ordered list / blockquote.
 *
 * The `onChange` callback is fired on every input event with the latest HTML.
 * The `value` prop is only used on initial mount and when the editor is empty
 * (to avoid clobbering the cursor position on every keystroke).
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export interface RichTextEditorProps {
  /** Initial HTML content. */
  value: string;
  /** Called on every input with the latest HTML. */
  onChange: (html: string) => void;
  /** Placeholder shown when empty. */
  placeholder?: string;
  /** Locale: 'zh' shows Chinese button tooltips. */
  locale?: 'zh' | 'en';
  /** Override the editor container className. */
  className?: string;
}

interface ToolbarButton {
  cmd: string;
  label: string;
  zhLabel: string;
  icon: React.ReactNode;
  /** For createLink, prompt for URL */
  prompt?: 'url';
  /** For formatBlock, value to pass */
  blockValue?: string;
}

const TOOLBAR: ToolbarButton[] = [
  {
    cmd: 'bold',
    label: 'Bold',
    zhLabel: '粗体',
    icon: <strong>B</strong>,
  },
  {
    cmd: 'italic',
    label: 'Italic',
    zhLabel: '斜体',
    icon: <em>I</em>,
  },
  {
    cmd: 'underline',
    label: 'Underline',
    zhLabel: '下划线',
    icon: <u>U</u>,
  },
  {
    cmd: 'formatBlock',
    blockValue: 'h1',
    label: 'H1',
    zhLabel: '标题1',
    icon: <span>H1</span>,
  },
  {
    cmd: 'formatBlock',
    blockValue: 'h2',
    label: 'H2',
    zhLabel: '标题2',
    icon: <span>H2</span>,
  },
  {
    cmd: 'createLink',
    label: 'Link',
    zhLabel: '链接',
    icon: <span>🔗</span>,
    prompt: 'url',
  },
  {
    cmd: 'insertUnorderedList',
    label: 'Bulleted List',
    zhLabel: '无序列表',
    icon: <span>•</span>,
  },
  {
    cmd: 'insertOrderedList',
    label: 'Numbered List',
    zhLabel: '有序列表',
    icon: <span>1.</span>,
  },
  {
    cmd: 'formatBlock',
    blockValue: 'blockquote',
    label: 'Quote',
    zhLabel: '引用',
    icon: <span>"</span>,
  },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  locale = 'en',
  className = '',
}: RichTextEditorProps) {
  const isZh = locale === 'zh';
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [activeCommands, setActiveCommands] = useState<Set<string>>(new Set());
  const lastValueRef = useRef(value);

  // Set initial content on mount
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== value && value) {
      el.innerHTML = value;
      lastValueRef.current = value;
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value when it differs from what we last emitted
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value === lastValueRef.current) return;
    if (document.activeElement === el) return; // don't clobber while typing
    el.innerHTML = value || '';
    lastValueRef.current = value;
  }, [value]);

  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastValueRef.current = html;
    onChange(html);
    updateActiveCommands();
  }, [onChange]);

  const updateActiveCommands = useCallback(() => {
    if (!document.queryCommandState) return;
    const active = new Set<string>();
    for (const btn of TOOLBAR) {
      try {
        // For formatBlock, check the current block
        if (btn.cmd === 'formatBlock' && btn.blockValue) {
          const current = document.queryCommandValue('formatBlock')?.toLowerCase();
          if (current === btn.blockValue.toLowerCase()) {
            active.add(`${btn.cmd}:${btn.blockValue}`);
          }
        } else if (btn.cmd !== 'createLink') {
          if (document.queryCommandState(btn.cmd)) {
            active.add(btn.cmd);
          }
        }
      } catch {
        // queryCommandState can throw for unsupported commands
      }
    }
    setActiveCommands(active);
  }, []);

  const exec = useCallback(
    (btn: ToolbarButton) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();

      try {
        if (btn.cmd === 'createLink') {
          const url = window.prompt(isZh ? '输入链接 URL' : 'Enter URL');
          if (!url) return;
          document.execCommand('createLink', false, url);
        } else if (btn.cmd === 'formatBlock' && btn.blockValue) {
          document.execCommand('formatBlock', false, btn.blockValue);
        } else {
          document.execCommand(btn.cmd, false);
        }
      } catch (err) {
        console.warn('[rich-text-editor] execCommand failed:', err);
      }

      handleInput();
    },
    [handleInput, isZh],
  );

  return (
    <div className={`overflow-hidden rounded-lg border ${className}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/50 p-2">
        {TOOLBAR.map((btn) => {
          const key = btn.blockValue ? `${btn.cmd}:${btn.blockValue}` : btn.cmd;
          const isActive = activeCommands.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => exec(btn)}
              title={isZh ? btn.zhLabel : btn.label}
              className={`flex h-8 min-w-[2rem] items-center justify-center rounded px-2 text-sm transition ${
                isActive
                  ? 'bg-muted text-foreground'
                  : 'bg-background text-foreground hover:bg-muted'
              }`}
            >
              {btn.icon}
            </button>
          );
        })}
      </div>

      {/* Editor body */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={updateActiveCommands}
        onMouseUp={updateActiveCommands}
        onKeyDown={updateActiveCommands}
        data-placeholder={placeholder || (isZh ? '开始撰写文章...' : 'Start writing...')}
        className="min-h-[300px] max-w-none p-4 text-sm outline-none focus:outline-none prose prose-sm dark:prose-invert [&:empty:before]:text-muted-foreground [&:empty:before]:content-[attr(data-placeholder)]"
      />
    </div>
  );
}
