import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm placeholder:text-neutral-400  disabled:opacity-50 disabled:cursor-not-allowed min-h-24 dark:border-neutral-700',
        className
      )}
      {...props}
    />
  )
})
Textarea.displayName = 'Textarea'

export { Textarea }
