"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface PromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  defaultValue?: string
  placeholder?: string
  onSubmit: (value: string) => void
}

export function PromptDialog({
  open,
  onOpenChange,
  title,
  defaultValue = "",
  placeholder,
  onSubmit,
}: PromptDialogProps) {
  const [value, setValue] = React.useState(defaultValue)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (open) {
      setValue(defaultValue)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open, defaultValue])

  const handleSubmit = () => {
    onSubmit(value)
    setValue("")
  }

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") {
      handleSubmit()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
