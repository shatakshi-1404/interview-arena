import { lazy, Suspense, useEffect, useRef } from 'react'
import type { BeforeMount, OnMount } from '@monaco-editor/react'
import { Skeleton } from '@/components/ui/Skeleton'

// Monaco is large: it only downloads when a code or SQL question is opened.
const Monaco = lazy(() => import('@monaco-editor/react'))

const defineTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('ia-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#FEFCF8',
      'editorLineNumber.foreground': '#A39D90',
      'editorLineNumber.activeForeground': '#5A554B',
      'editor.lineHighlightBackground': '#F4EFE2',
      'editorCursor.foreground': '#BF8A05',
      'editor.selectionBackground': '#F9E08566',
    },
  })
}

export interface CodeEditorProps {
  value: string
  onChange: (v: string) => void
  language: 'sql' | 'python' | 'java'
  onRun?: () => void
  onSubmit?: () => void
  height?: number
  ariaLabel?: string
}

export function CodeEditor({ value, onChange, language, onRun, onSubmit, height = 300, ariaLabel = 'Code editor' }: CodeEditorProps) {
  const runRef = useRef(onRun)
  const submitRef = useRef(onSubmit)
  useEffect(() => {
    runRef.current = onRun
    submitRef.current = onSubmit
  })

  const onMount: OnMount = (editor, monaco) => {
    // Monaco swallows key events, so the page-level shortcut hook can't see them: register here.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.())
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => submitRef.current?.())
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line-strong">
      <Suspense fallback={<div style={{ height }}><Skeleton className="h-full w-full rounded-none" /></div>}>
        <Monaco
          height={height}
          language={language}
          value={value}
          theme="ia-light"
          beforeMount={defineTheme}
          onMount={onMount}
          onChange={(v) => onChange(v ?? '')}
          loading={<div className="p-4 text-sm text-ink-500">Loading editor…</div>}
          options={{
            ariaLabel,
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
          }}
        />
      </Suspense>
    </div>
  )
}
