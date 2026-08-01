"use client";

import { useState, type MouseEvent } from "react";
import { Button, ConfirmDialog } from "@/components/ui";

export function UserActionButton({ label, title, description, destructive = false }: { label: string; title: string; description: string; destructive?: boolean }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<HTMLFormElement | null>(null);
  function request(event: MouseEvent<HTMLButtonElement>) {
    setForm(event.currentTarget.form);
    setOpen(true);
  }
  return <><Button type="button" size="small" variant={destructive ? "destructive" : "secondary"} onClick={request}>{label}</Button><ConfirmDialog open={open} title={title} description={description} confirmLabel={label} destructive={destructive} onCancel={() => setOpen(false)} onConfirm={() => form?.requestSubmit()} /></>;
}
