import { useToastStore } from '../stores/toastStore';

export function useToast() {
  const addToast = useToastStore((state) => state.addToast);

  const toast = (type, title, message, duration) => {
    return addToast(type, title, message, duration);
  };

  const success = (title, message, duration) => addToast('success', title, message, duration);
  const error = (title, message, duration) => addToast('error', title, message, duration);
  const warning = (title, message, duration) => addToast('warning', title, message, duration);
  const info = (title, message, duration) => addToast('info', title, message, duration);

  return { toast, success, error, warning, info };
}
