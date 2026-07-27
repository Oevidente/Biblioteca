import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  onConfirm,
  onCancel,
  isDestructive = true
}: ConfirmModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm rounded-2xl p-6 space-y-4 bg-white dark:bg-[#1A1A1A] shadow-2xl border border-black/10 dark:border-white/10 flex flex-col">
        <div className="flex justify-between items-center pb-2 border-b border-black/10 dark:border-white/10">
          <h3 className="font-serif font-bold text-lg">{title}</h3>
          <button 
            onClick={onCancel}
            className="p-1.5 rounded-full opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <p className="text-sm opacity-80 py-2">
          {message}
        </p>

        <div className="flex justify-end gap-3 pt-4 border-t border-black/10 dark:border-white/10">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white transition-colors shadow-sm ${
              isDestructive 
                ? "bg-red-500 hover:bg-red-600" 
                : "bg-[#1A1A1A] dark:bg-white dark:text-[#1A1A1A] hover:bg-black/80"
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
