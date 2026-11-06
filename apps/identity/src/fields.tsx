import { Input, type InputProps } from 'antd'
import type { ReactNode } from 'react'

export function Field({ label, id, ...props }: InputProps & { label: string; id: string }) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <Input id={id} {...props} />
    </div>
  )
}
export function Secret({ label, id, ...props }: InputProps & { label: string; id: string }) {
  return <Field label={label} id={id} {...props} type="password" />
}
export function Notice({ error }: { error: string }) {
  return error ? <p role="alert">{error}</p> : null
}
export function Task({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <details
      className="auth-task"
      onToggle={(event) => {
        if (!event.currentTarget.open) onClose()
      }}
    >
      <summary>{title}</summary>
      {children}
    </details>
  )
}
