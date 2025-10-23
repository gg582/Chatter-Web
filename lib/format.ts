export const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};
