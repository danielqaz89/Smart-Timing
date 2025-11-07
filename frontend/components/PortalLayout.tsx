'use client';

import { ReactNode } from 'react';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  IconButton,
  Chip,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  PersonAdd as PersonAddIcon,
  Folder as FolderIcon,
  Description as DescriptionIcon,
  Assessment as AssessmentIcon,
  Settings as SettingsIcon,
  AccountCircle,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { useCompany } from '../contexts/CompanyContext';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';

const drawerWidth = 260;

interface NavigationItem {
  label: string;
  path: string;
  icon: ReactNode;
  roles: Array<'admin' | 'case_manager' | 'member'>;
}

const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', path: '/portal/dashboard', icon: <DashboardIcon />, roles: ['admin', 'case_manager', 'member'] },
  { label: 'Invitasjoner', path: '/portal/invites', icon: <PersonAddIcon />, roles: ['admin'] },
  { label: 'Brukere', path: '/portal/users', icon: <PeopleIcon />, roles: ['admin', 'case_manager'] },
  { label: 'Saker', path: '/portal/cases', icon: <FolderIcon />, roles: ['admin', 'case_manager'] },
  { label: 'Maler', path: '/portal/templates', icon: <DescriptionIcon />, roles: ['admin'] },
  { label: 'Rapporter', path: '/portal/reports', icon: <AssessmentIcon />, roles: ['admin', 'case_manager'] },
  { label: 'Innstillinger', path: '/portal/settings', icon: <SettingsIcon />, roles: ['admin'] },
];

export default function PortalLayout({ children }: { children: ReactNode }) {
  const { company, user, logout, hasRole } = useCompany();
  const router = useRouter();
  const pathname = usePathname();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleMenuClose();
    logout();
  };

  const filteredNav = navigationItems.filter(item => 
    item.roles.some(role => hasRole(role))
  );

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrator';
      case 'case_manager': return 'Saksbehandler';
      case 'member': return 'Medlem';
      default: return role;
    }
  };

  const getRoleColor = (role: string): "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning" => {
    switch (role) {
      case 'admin': return 'error';
      case 'case_manager': return 'primary';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: `calc(100% - ${drawerWidth}px)`,
          ml: `${drawerWidth}px`,
          bgcolor: 'background.paper',
          color: 'text.primary',
        }}
        elevation={1}
      >
        <Toolbar>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {company?.name || 'Bedriftsportal'}
          </Typography>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Chip 
              label={getRoleLabel(user?.role || '')} 
              size="small" 
              color={getRoleColor(user?.role || '')}
            />
            <IconButton onClick={handleMenuOpen} size="small">
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}>
                {user?.email.charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>
          </Box>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem disabled>
              <Typography variant="body2" color="text.secondary">
                {user?.email}
              </Typography>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon>
                <LogoutIcon fontSize="small" />
              </ListItemIcon>
              Logg ut
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Drawer
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
          },
        }}
        variant="permanent"
        anchor="left"
      >
        <Toolbar sx={{ justifyContent: 'center', py: 2 }}>
          {company?.logo_base64 ? (
            <img 
              src={company.logo_base64} 
              alt={company.name} 
              style={{ maxWidth: '80%', maxHeight: '60px', objectFit: 'contain' }} 
            />
          ) : (
            <Typography variant="h6" color="primary">
              Smart Timing
            </Typography>
          )}
        </Toolbar>
        <Divider />
        <List>
          {filteredNav.map((item) => (
            <ListItem key={item.path} disablePadding>
              <ListItemButton
                selected={pathname === item.path}
                onClick={() => router.push(item.path)}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: 'background.default',
          p: 3,
          mt: 8,
          minHeight: '100vh',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
