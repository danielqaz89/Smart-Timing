import useSWR from 'swr';
import { fetchSettings, updateSettings, fetchProjectInfo, createProjectInfo, updateProjectInfo, fetchQuickTemplates, createQuickTemplate, deleteQuickTemplate, type UserSettings, type ProjectInfo, type QuickTemplate } from './api';

const USER_ID = 'default'; // Future: get from auth context

// ===== USER SETTINGS HOOK =====
export function useUserSettings() {
  const { data, error, mutate, isLoading } = useSWR<UserSettings>(
    ['settings', USER_ID],
    () => fetchSettings(USER_ID),
    { revalidateOnFocus: false }
  );

  const update = async (partial: Partial<UserSettings>) => {
    try {
      const updated = await updateSettings(partial, USER_ID);
      await mutate(updated, false);
      return updated;
    } catch (e) {
      throw e;
    }
  };

  return {
    settings: data,
    isLoading,
    error,
    updateSettings: update,
    mutate,
  };
}

// ===== PROJECT INFO HOOK =====
export function useProjectInfo() {
  const { data, error, mutate, isLoading } = useSWR<ProjectInfo | null>(
    ['project-info', USER_ID],
    () => fetchProjectInfo(USER_ID),
    { revalidateOnFocus: false }
  );

  const create = async (projectData: Omit<ProjectInfo, 'id' | 'is_active' | 'created_at' | 'updated_at'>) => {
    try {
      const created = await createProjectInfo(projectData, USER_ID);
      await mutate(created, false);
      return created;
    } catch (e) {
      throw e;
    }
  };

  const update = async (id: number, partial: Partial<ProjectInfo>) => {
    try {
      const updated = await updateProjectInfo(id, partial);
      await mutate(updated, false);
      return updated;
    } catch (e) {
      throw e;
    }
  };

  return {
    projectInfo: data,
    isLoading,
    error,
    createProjectInfo: create,
    updateProjectInfo: update,
    mutate,
  };
}

// ===== QUICK TEMPLATES HOOK =====
export function useQuickTemplates() {
  const { data, error, mutate, isLoading } = useSWR<QuickTemplate[]>(
    ['quick-templates', USER_ID],
    () => fetchQuickTemplates(USER_ID),
    { revalidateOnFocus: false }
  );

  const create = async (templateData: Omit<QuickTemplate, 'id' | 'created_at' | 'user_id'>) => {
    try {
      const created = await createQuickTemplate(templateData, USER_ID);
      await mutate([...(data || []), created], false);
      return created;
    } catch (e) {
      throw e;
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteQuickTemplate(id);
      await mutate((data || []).filter(t => t.id !== id), false);
    } catch (e) {
      throw e;
    }
  };

  return {
    templates: data || [],
    isLoading,
    error,
    createTemplate: create,
    deleteTemplate: remove,
    mutate,
  };
}
