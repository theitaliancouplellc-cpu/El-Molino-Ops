'use client';

import { useEffect } from 'react';

export default function FormDirtyGuard() {
  useEffect(() => {
    const mark = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const form = target.closest('form');
      if (form) form.dataset.dirty = 'true';
      if (target instanceof HTMLTextAreaElement) target.dataset.dirty = 'true';
    };
    const reset = (event: Event) => {
      if (event.target instanceof HTMLFormElement) delete event.target.dataset.dirty;
    };
    document.addEventListener('input', mark, true);
    document.addEventListener('change', mark, true);
    document.addEventListener('reset', reset, true);
    return () => {
      document.removeEventListener('input', mark, true);
      document.removeEventListener('change', mark, true);
      document.removeEventListener('reset', reset, true);
    };
  }, []);
  return null;
}
