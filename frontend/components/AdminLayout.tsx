'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Business as CompaniesIcon,
  AdminPanelSettings as AdminIcon,
  SupervisorAccount as SuperAdminIcon,
  ExitToApp as LogoutIcon,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Article as PagesIcon,
  Palette as ThemesIcon,
  Translate as TranslateIcon,
  Image as MediaIcon,
} from '@mui/icons-material';
import { useAdmin } from '../contexts/AdminContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslations } from '../contexts/TranslationsContext';

const DRAWER_WIDTH = 240;

const menuItems: Array<{ key: string; label: string; path: string; icon: React.ReactNode; requireRole?: string }> = [
  { key: 'admin.dashboard', label: 'Dashboard', path: '/admin/dashboard', icon: <DashboardIcon /> },
  { key: 'admin.users', label: 'Users', path: '/admin/users', icon: <PeopleIcon /> },
  { key: 'admin.companies', label: 'Companies', path: '/admin/companies', icon: <CompaniesIcon /> },
  { key: 'admin.audit_log', label: 'Audit Log', path: '/admin/audit', icon: <HistoryIcon /> },
  { key: 'admin.settings', label: 'Settings', path: '/admin/settings', icon: <SettingsIcon /> },
  { key: 'admin.cms_pages', label: 'CMS Pages', path: '/admin/cms/pages', icon: <PagesIcon /> },
  { key: 'admin.cms_themes', label: 'CMS Themes', path: '/admin/cms/themes', icon: <ThemesIcon /> },
  { key: 'admin.cms_translations', label: 'CMS Translations', path: '/admin/cms/translations', icon: <TranslateIcon /> },
  { key: 'admin.cms_media', label: 'CMS Media', path: '/admin/cms/media', icon: <MediaIcon /> },
  { key: 'admin.admins', label: 'Admins', path: '/admin/admins', icon: <SuperAdminIcon />, requireRole: 'super_admin' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { admin, loading, logout } = useAdmin();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  useEffect(() => {
    if (!loading && !admin && pathname !== '/admin') {
      router.push('/admin');
    }
  }, [admin, loading, router, pathname]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Typography>Loading...</Typography>
      </Box>
    );
  }

  if (!admin) {
    return null; // Will redirect
  }

  const handleProfileMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleProfileMenuClose();
    logout();
  };

  return (
    <Box sx={{ display: 'flex' }}>
      {/* App Bar */}
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Box sx={{ mr: 2, display: 'flex', alignItems: 'center' }}>
            <img src="/icons/logo.svg" alt="Smart Timing" style={{ height: 28 }} />
          </Box>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {t('admin.title', 'Smart Timing Admin')}
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2">
              {admin.username} ({admin.role})
            </Typography>
            <IconButton onClick={handleProfileMenuOpen} size="small">
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                {admin.username[0].toUpperCase()}
              </Avatar>
            </IconButton>
          </Box>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleProfileMenuClose}
          >
            <MenuItem onClick={() => { setLanguage(language === 'no' ? 'en' : 'no'); handleProfileMenuClose(); }}>
              <TranslateIcon sx={{ mr: 1 }} fontSize="small" />
              {language === 'no' ? t('common.switch_to_english', 'Switch to English') : t('common.switch_to_norwegian', 'Bytt til Norsk')}
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ mr: 1 }} fontSize="small" />
              {t('common.logout', 'Logg ut')}
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {menuItems
              .filter((item) => !item.requireRole || admin?.role === item.requireRole)
              .map((item) => (
                <ListItem key={item.path} disablePadding>
                  <ListItemButton
                    selected={pathname === item.path}
                    onClick={() => router.push(item.path)}
                  >
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText primary={t(item.key, item.label)} />
                  </ListItemButton>
                </ListItem>
              ))}
          </List>
        </Box>
      </Drawer>

      {/* Main Content */}
      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
