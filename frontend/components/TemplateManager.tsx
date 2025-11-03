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
      onToast("Navn og aktivitet er påkrevd", "error");
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
      onToast("Mal lagret", "success");
      handleClose();
    } catch (e: any) {
      onToast(`Feil: ${e?.message || e}`, "error");
    }
  };

  const handleDelete = async (id: number, label: string) => {
    if (!confirm(`Sikker på at du vil slette "${label}"?`)) return;
    try {
      await onDelete(id);
      onToast("Mal slettet", "success");
    } catch (e: any) {
      onToast(`Feil: ${e?.message || e}`, "error");
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Maler for hurtigstempling"
          subheader="Opprett maler for aktiviteter du gjør ofte"
          action={
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpen()}
              size="small"
            >
              Ny mal
            </Button>
          }
        />
        <CardContent>
          {templates.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography variant="body2" color="text.secondary">
                Ingen maler enda. Klikk "Ny mal" for å opprette din første mal.
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
                        aria-label="delete"
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
                          label={template.activity === "Work" ? "Arbeid" : "Møte"}
                          size="small"
                          color={template.activity === "Work" ? "primary" : "secondary"}
                        />
                      </Stack>
                    }
                    secondary={
                      <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} flexWrap="wrap">
                        {template.title && (
                          <Chip label={`Tittel: ${template.title}`} size="small" variant="outlined" />
                        )}
                        {template.project && (
                          <Chip label={`Prosjekt: ${template.project}`} size="small" variant="outlined" />
                        )}
                        {template.place && (
                          <Chip label={`Sted: ${template.place}`} size="small" variant="outlined" />
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
        <DialogTitle>{editMode ? "Rediger mal" : "Ny mal"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Navn på mal *"
              value={currentTemplate.label || ""}
              onChange={(e) =>
                setCurrentTemplate({ ...currentTemplate, label: e.target.value })
              }
              fullWidth
              placeholder="F.eks. 'Arbeid på kontoret'"
              helperText="Dette vises i listen over maler"
            />

            <FormControl fullWidth>
              <InputLabel>Aktivitet *</InputLabel>
              <Select
                label="Aktivitet *"
                value={currentTemplate.activity || "Work"}
                onChange={(e) =>
                  setCurrentTemplate({
                    ...currentTemplate,
                    activity: e.target.value as "Work" | "Meeting",
                  })
                }
              >
                <MenuItem value="Work">Arbeid</MenuItem>
                <MenuItem value="Meeting">Møte</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Tittel / Møte"
              value={currentTemplate.title || ""}
              onChange={(e) =>
                setCurrentTemplate({ ...currentTemplate, title: e.target.value })
              }
              fullWidth
              placeholder="F.eks. 'Prosjektmøte'"
            />

            <TextField
              label="Prosjekt / Kunde"
              value={currentTemplate.project || ""}
              onChange={(e) =>
                setCurrentTemplate({ ...currentTemplate, project: e.target.value })
              }
              fullWidth
              placeholder="F.eks. 'Kunde A'"
            />

            <TextField
              label="Sted / Modus"
              value={currentTemplate.place || ""}
              onChange={(e) =>
                setCurrentTemplate({ ...currentTemplate, place: e.target.value })
              }
              fullWidth
              placeholder="F.eks. 'Kontor', 'Hjemmekontor', 'Felt'"
            />

            <Typography variant="caption" color="text.secondary">
              * Påkrevd felt
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Avbryt</Button>
          <Button onClick={handleSave} variant="contained">
            Lagre
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
