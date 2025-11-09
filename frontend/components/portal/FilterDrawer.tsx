'use client';

import { 
  Drawer, 
  Box, 
  Typography, 
  Button, 
  FormControl, 
  FormLabel, 
  FormGroup, 
  FormControlLabel, 
  Checkbox, 
  TextField, 
  Divider,
  Badge,
  IconButton,
  Stack,
  Chip
} from '@mui/material';
import { Close, FilterList } from '@mui/icons-material';

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: {
    statuses: string[];
    monthStart: string;
    monthEnd: string;
    userSearch: string;
    caseSearch: string;
  };
  onFiltersChange: (filters: any) => void;
  onClear: () => void;
}

export default function FilterDrawer({ 
  open, 
  onClose, 
  filters, 
  onFiltersChange,
  onClear
}: FilterDrawerProps) {
  const statuses = ['submitted', 'approved', 'rejected', 'draft'];

  const handleStatusToggle = (status: string) => {
    const newStatuses = filters.statuses.includes(status)
      ? filters.statuses.filter(s => s !== status)
      : [...filters.statuses, status];
    onFiltersChange({ ...filters, statuses: newStatuses });
  };

  const activeFilterCount = 
    filters.statuses.length + 
    (filters.monthStart ? 1 : 0) + 
    (filters.monthEnd ? 1 : 0) +
    (filters.userSearch ? 1 : 0) +
    (filters.caseSearch ? 1 : 0);

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 350, p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FilterList />
            <Typography variant="h6">Filtre</Typography>
            {activeFilterCount > 0 && (
              <Chip label={activeFilterCount} size="small" color="primary" />
            )}
          </Box>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>

        <Stack spacing={3}>
          {/* Status Filter */}
          <Box>
            <FormControl component="fieldset">
              <FormLabel component="legend">Status</FormLabel>
              <FormGroup>
                {statuses.map((status) => (
                  <FormControlLabel
                    key={status}
                    control={
                      <Checkbox
                        checked={filters.statuses.includes(status)}
                        onChange={() => handleStatusToggle(status)}
                      />
                    }
                    label={status.charAt(0).toUpperCase() + status.slice(1)}
                  />
                ))}
              </FormGroup>
            </FormControl>
          </Box>

          <Divider />

          {/* Month Range */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>Månedsperiode</Typography>
            <Stack spacing={2}>
              <TextField
                type="month"
                label="Fra måned"
                InputLabelProps={{ shrink: true }}
                value={filters.monthStart}
                onChange={(e) => onFiltersChange({ ...filters, monthStart: e.target.value })}
                fullWidth
                size="small"
              />
              <TextField
                type="month"
                label="Til måned"
                InputLabelProps={{ shrink: true }}
                value={filters.monthEnd}
                onChange={(e) => onFiltersChange({ ...filters, monthEnd: e.target.value })}
                fullWidth
                size="small"
              />
            </Stack>
          </Box>

          <Divider />

          {/* User Search */}
          <Box>
            <TextField
              label="Søk etter bruker"
              placeholder="E-post..."
              value={filters.userSearch}
              onChange={(e) => onFiltersChange({ ...filters, userSearch: e.target.value })}
              fullWidth
              size="small"
            />
          </Box>

          {/* Case Search */}
          <Box>
            <TextField
              label="Søk etter saks-ID"
              placeholder="Saksnummer..."
              value={filters.caseSearch}
              onChange={(e) => onFiltersChange({ ...filters, caseSearch: e.target.value })}
              fullWidth
              size="small"
            />
          </Box>

          <Divider />

          {/* Actions */}
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={onClear} fullWidth>
              Nullstill
            </Button>
            <Button variant="contained" onClick={onClose} fullWidth>
              Bruk filtre
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Drawer>
  );
}
