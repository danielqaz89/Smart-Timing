"use client";
import { useState } from "react";
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Stack,
  TextField,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { useTranslations } from "../contexts/TranslationsContext";

interface Template {
  id: number;
  label: string;
  activity: "Work" | "Meeting";
  title?: string;
  project?: string;
  place?: string;
  is_favorite?: boolean;
  display_order?: number;
}

interface TemplateManagerProps {
  templates: Template[];
  onCreate: (template: Omit<Template, "id">) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onToast: (msg: string, severity?: any) => void;
}

export default function TemplateManager({
  templates,
  onCreate,
  onDelete,
  onToast,
}: TemplateManagerProps) {
  const { t } = useTranslations();
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<Partial<Template>>({
    label: "",
    activity: "Work",
    title: "",
    project: "",
    place: "",
  });

  const handleOpen = (template?: Template) => {
    if (template) {
      setEditMode(true);
      setCurrentTemplate(template);
    } else {
      setEditMode(false);
      setCurrentTemplate({
        label: "",
        activity: "Work",
        title: "",
        project: "",
        place: "",
      });
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setCurrentTemplate({
      label: "",
      activity: "Work",
      title: "",
      project: "",
      place: "",
    });
  };

  const handleSave = async () => {
    if (!currentTemplate.label || !currentTemplate.activity) {
      onToast(t('common.name_activity_required', 'Navn og aktivitet er påkrevd'), "error");
      return;
    }

    try {
      await onCreate({
        label: currentTemplate.label,
        activity: currentTemplate.activity as "Work" | "Meeting",
        title: currentTemplate.title || undefined,
        project: currentTemplate.project || undefined,
        place: currentTemplate.place || undefined,
        is_favorite: false,
        display_order: templates.length,
      });
      onToast(t('templates.saved', 'Mal lagret'), "success");
      handleClose();
    } catch (e: any) {
      onToast(`${t('common.error', 'Feil')}: ${e?.message || e}`, "error");
    }
  };

  const handleDelete = async (id: number, label: string) => {
    if (!confirm(`${t('confirm.delete_template', 'Sikker på at du vil slette')} "${label}"?`)) return;
    try {
      await onDelete(id);
      onToast(t('templates.deleted', 'Mal slettet'), "success");
    } catch (e: any) {
      onToast(`${t('common.error', 'Feil')}: ${e?.message || e}`, "error");
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title={t('templates.header', 'Maler for hurtigstempling')}
          subheader={t('templates.subheader', 'Opprett maler for aktiviteter du gjør ofte')}
          action={
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpen()}
              size="small"
            >
              {t('templates.new', 'Ny mal')}
            </Button>
          }
        />
        <CardContent>
          {templates.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                {t('templates.none', 'Ingen maler enda. Klikk "Ny mal" for å opprette din første mal.')}
              </Typography>
            </Box>
          ) : (
            <List>
              {templates.map((template) => (
                <ListItem
                  key={template.id}
                  sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                    mb: 1,
                  }}
                  secondaryAction={
                    <Stack direction="row" spacing={0.5}>
                      <IconButton
                        edge="end"
                        aria-label={t('aria.delete_template', 'Slett mal')}
                        onClick={() => handleDelete(template.id, template.label)}
                        size="small"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  }
                >
                  <DragIndicatorIcon sx={{ mr: 1, color: "text.disabled" }} />
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body1" fontWeight="medium">
                          {template.label}
                        </Typography>
                        <Chip
                          label={template.activity === "Work" ? t('stats.work', 'Arbeid') : t('stats.meetings', 'Møte')}
                          size="small"
                          color={template.activity === "Work" ? "primary" : "secondary"}
                        />
                      </Stack>
                    }
                    secondary={
                      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap">
                        {template.title && (
                          <Chip label={`${t('table.title', 'Tittel')}: ${template.title}`} size="small" variant="outlined" />
                        )}
                        {template.project && (
                          <Chip label={`${t('table.project', 'Prosjekt')}: ${template.project}`} size="small" variant="outlined" />
                        )}
                        {template.place && (
                          <Chip label={`${t('table.place', 'Sted')}: ${template.place}`} size="small" variant="outlined" />
                        )}
                      </Stack>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
        <DialogTitle>{editMode ? t('templates.edit_title', 'Rediger mal') : t('templates.new_title', 'Ny mal')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={`${t('templates.name_label', 'Navn på mal')} *`}
              value={currentTemplate.label || ""}
              onChange={(e) =>
                setCurrentTemplate({ ...currentTemplate, label: e.target.value })
              }
              fullWidth
              placeholder={t('templates.name_placeholder', "F.eks. 'Arbeid på kontoret'")}
              helperText={t('templates.name_helper', 'Dette vises i listen over maler')}
            />

            <FormControl fullWidth>
              <InputLabel>{`${t('fields.activity', 'Aktivitet')} *`}</InputLabel>
              <Select
                label={`${t('fields.activity', 'Aktivitet')} *`}
                value={currentTemplate.activity || "Work"}
                onChange={(e) =>
                  setCurrentTemplate({
                    ...currentTemplate,
                    activity: e.target.value as "Work" | "Meeting",
                  })
                }
              >
                <MenuItem value="Work">{t('stats.work', 'Arbeid')}</MenuItem>
                <MenuItem value="Meeting">{t('stats.meetings', 'Møte')}</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label={t('fields.title_meeting', 'Tittel / Møte')}
              value={currentTemplate.title || ""}
              onChange={(e) =>
                setCurrentTemplate({ ...currentTemplate, title: e.target.value })
              }
              fullWidth
              placeholder={t('helpers.eg_title_meeting', "F.eks. 'Prosjektmøte'")}
            />

            <TextField
              label={t('fields.project_client', 'Prosjekt / Kunde')}
              value={currentTemplate.project || ""}
              onChange={(e) =>
                setCurrentTemplate({ ...currentTemplate, project: e.target.value })
              }
              fullWidth
              placeholder={t('helpers.eg_project_client', "F.eks. 'Kunde A'")}
            />

            <TextField
              label={t('fields.place_mode', 'Sted / Modus')}
              value={currentTemplate.place || ""}
              onChange={(e) =>
                setCurrentTemplate({ ...currentTemplate, place: e.target.value })
              }
              fullWidth
              placeholder={t('helpers.eg_place_mode', "F.eks. 'Kontor', 'Hjemmekontor', 'Felt'")}
            />

            <Typography variant="caption" color="text.secondary">
              {t('common.required_fields', '* Påkrevd felt')}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>{t('common.cancel', 'Avbryt')}</Button>
          <Button onClick={handleSave} variant="contained">
            {t('common.save', 'Lagre')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
