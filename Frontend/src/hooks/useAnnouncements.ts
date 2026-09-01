import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Announcement, AnnouncementAttachment } from '@/types';

export function useAnnouncements() {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: () => api.get<Announcement[]>('/announcements'),
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; body?: string | null; visibility: 'all' | 'locations' | 'roles'; locations?: string[]; roles?: string[] }) =>
      api.post<Announcement>('/announcements', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  });
}

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...updates }: { id: string; title?: string; body?: string | null; visibility?: 'all' | 'locations' | 'roles'; locations?: string[]; roles?: string[] }) =>
      api.patch<Announcement>(`/announcements/${id}`, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/announcements/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  });
}

export function useUploadAnnouncementAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ announcementId, file }: { announcementId: string; file: File }) => {
      const formData = new FormData();
      formData.append('announcement_id', announcementId);
      formData.append('file', file);
      return api.upload<AnnouncementAttachment>('/announcement-attachments/upload', formData);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  });
}

export function useDeleteAnnouncementAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/announcement-attachments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  });
}
