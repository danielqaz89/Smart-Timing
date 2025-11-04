"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Card, CardContent, CardHeader, Container, Stack, TextField, Typography, CircularProgress, Autocomplete, Fade, MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import GroupIcon from '@mui/icons-material/Group';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SportsIcon from '@mui/icons-material/Sports';
import NatureIcon from '@mui/icons-material/Nature';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import Image from "next/image";
import { useProjectInfo } from "../../lib/hooks";
import { searchBrregCompany, KINOA_TILTAK_AS, type BrregCompany } from "../../lib/brreg";

interface Company {
  id: number;
  name: string;
  logo_base64: string | null;
  display_order: number;
}

export default function Setup() {
  const router = useRouter();
  const { projectInfo, createProjectInfo, updateProjectInfo, isLoading } = useProjectInfo();
  const [form, setForm] = useState({
    konsulent: "",
    bedrift: "",
    oppdragsgiver: "",
    tiltak: "",
    periode: "",
    klientId: "",
    mottakerEpost: "",
  });
  const [saving, setSaving] = useState(false);
  const [brregOptions, setBrregOptions] = useState<BrregCompany[]>([]);
  const [brregLoading, setBrregLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  // Fetch companies from API
  useEffect(() => {
    async function fetchCompanies() {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
        const res = await fetch(`${apiBase}/api/companies`);
        if (res.ok) {
          const data = await res.json();
          setCompanies(data);
        }
      } catch (e) {
        console.error('Failed to fetch companies:', e);
      }
    }
    fetchCompanies();
  }, []);

  // Load existing project info from database
  useEffect(() => {
    if (projectInfo) {
      setForm({
        konsulent: projectInfo.konsulent || "",
        bedrift: projectInfo.bedrift || "",
        oppdragsgiver: projectInfo.oppdragsgiver || "",
        tiltak: projectInfo.tiltak || "",
        periode: projectInfo.periode || "",
        klientId: projectInfo.klient_id || "",
        mottakerEpost: "", // Email moved to user_settings
      });
    }
  }, [projectInfo]);

  // Update logo when company changes
  useEffect(() => {
    // Check if it's Kinoa - use Imgur hosted logo
    if (form.bedrift.toLowerCase().includes('kinoa')) {
      setCompanyLogo('https://i.imgur.com/rNb7JRX.png');
    } else {
      // Try to find logo from database for other companies
      const matchedCompany = companies.find(
        c => form.bedrift.toLowerCase().includes(c.name.toLowerCase())
      );
      setCompanyLogo(matchedCompany?.logo_base64 || null);
    }
  }, [form.bedrift, companies]);

  // BRREG search with debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (form.bedrift && form.bedrift.length >= 2) {
        setBrregLoading(true);
        const results = await searchBrregCompany(form.bedrift);
        // Always include Kinoa as first option if it matches, then BRREG results
        const kinoaMatches = KINOA_TILTAK_AS.navn.toLowerCase().includes(form.bedrift.toLowerCase());
        setBrregOptions(kinoaMatches ? [KINOA_TILTAK_AS, ...results] : results);
        setBrregLoading(false);
      } else {
        // Show Kinoa by default when field is empty or has < 2 chars
        setBrregOptions([KINOA_TILTAK_AS]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [form.bedrift]);

  async function save() {
    setSaving(true);
    try {
      if (projectInfo?.id) {
        await updateProjectInfo(projectInfo.id, {
          konsulent: form.konsulent,
          bedrift: form.bedrift,
          oppdragsgiver: form.oppdragsgiver,
          tiltak: form.tiltak,
          periode: form.periode,
          klient_id: form.klientId,
        });
      } else {
        await createProjectInfo({
          konsulent: form.konsulent,
          bedrift: form.bedrift,
          oppdragsgiver: form.oppdragsgiver,
          tiltak: form.tiltak,
          periode: form.periode,
          klient_id: form.klientId,
        });
      }
      router.replace("/");
    } catch (e) {
      console.error("Failed to save project info:", e);
      alert("Kunne ikke lagre prosjektinfo. Prøv igjen.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Container maxWidth="sm" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Card sx={{ width: '100%', bgcolor: 'rgba(13,17,23,0.7)', backdropFilter: 'blur(8px)', borderRadius: 3 }}>
        <CardHeader 
          title={
            <Typography variant="h5" align="center">
              {projectInfo ? 'Rediger prosjektinformasjon' : 'Prosjektinformasjon'}
            </Typography>
          } 
        />
        <CardContent>
          <Stack spacing={2}>
            {companyLogo && (
              <Fade in={Boolean(companyLogo)}>
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  py: 2,
                  px: 2,
                  bgcolor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 2,
                  mb: 1
                }}>
                  <img 
                    src={companyLogo} 
                    alt="Company Logo" 
                    style={{ 
                      maxWidth: '300px', 
                      maxHeight: '120px', 
                      objectFit: 'contain',
                      filter: 'brightness(0.95) contrast(1.05)',
                      mixBlendMode: 'lighten'
                    }}
                  />
                </Box>
              </Fade>
            )}
            <TextField 
              label="Konsulent" 
              value={form.konsulent} 
              onChange={(e)=>setForm({ ...form, konsulent: e.target.value })} 
              fullWidth 
              required
              aria-label="Konsulent navn"
            />
            <Autocomplete
              freeSolo
              options={brregOptions}
              getOptionLabel={(option) => typeof option === 'string' ? option : `${option.navn} (${option.organisasjonsnummer})`}
              inputValue={form.bedrift}
              onInputChange={(_, newValue) => setForm({ ...form, bedrift: newValue })}
              onChange={(_, newValue) => {
                if (typeof newValue === 'object' && newValue) {
                  setForm({ ...form, bedrift: newValue.navn });
                }
              }}
              loading={brregLoading}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Hvilken bedrift jobber du for?"
                  placeholder="Søk etter bedrift..."
                  required
                  aria-label="Bedrift søk"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {brregLoading ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderOption={(props, option) => (
                <Box component="li" {...props} key={option.organisasjonsnummer}>
                  <Stack>
                    <Typography variant="body2">{option.navn}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Org.nr: {option.organisasjonsnummer}
                      {option.organisasjonsform && ` • ${option.organisasjonsform.beskrivelse}`}
                    </Typography>
                  </Stack>
                </Box>
              )}
            />
            <TextField 
              label="Oppdragsgiver" 
              value={form.oppdragsgiver} 
              onChange={(e)=>setForm({ ...form, oppdragsgiver: e.target.value })} 
              fullWidth 
              required
              aria-label="Oppdragsgiver navn"
            />
            <Autocomplete
              freeSolo
              options={[
                { label: 'Miljøarbeider', icon: <GroupIcon /> },
                { label: 'Sosialarbeider', icon: <PsychologyIcon /> },
                { label: 'Aktivitør', icon: <SportsIcon /> },
                { label: 'Miljøterapeut', icon: <NatureIcon /> },
                { label: 'Tiltaksleder', icon: <ManageAccountsIcon /> },
              ]}
              value={form.tiltak}
              onChange={(_, newValue) => {
                if (typeof newValue === 'object' && newValue) {
                  setForm({ ...form, tiltak: newValue.label });
                } else {
                  setForm({ ...form, tiltak: newValue || '' });
                }
              }}
              onInputChange={(_, newValue) => setForm({ ...form, tiltak: newValue })}
              getOptionLabel={(option) => typeof option === 'string' ? option : option.label}
              renderOption={(props, option) => (
                <Box component="li" {...props} key={option.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {option.icon}
                  <Typography>{option.label}</Typography>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tiltak / Rolle"
                  placeholder="Velg eller skriv din rolle..."
                  aria-label="Tiltak eller rolle"
                  helperText="Velg rolle fra listen eller skriv egen. Påvirker rapportmal."
                />
              )}
            />
            <TextField 
              label="Periode" 
              value={form.periode} 
              onChange={(e)=>setForm({ ...form, periode: e.target.value })} 
              fullWidth
              placeholder="f.eks. Q1 2025"
              aria-label="Periode"
            />
            <TextField 
              label="Klient ID / Saks nr" 
              value={form.klientId} 
              onChange={(e)=>setForm({ ...form, klientId: e.target.value })} 
              fullWidth
              aria-label="Klient ID eller saksnummer"
            />
            <Typography variant="caption" color="text.secondary">
              E-postinnstillinger konfigureres i hovedvinduet under innstillinger.
            </Typography>
            <Button 
              variant="contained" 
              onClick={save} 
              disabled={saving || !form.konsulent || !form.bedrift || !form.oppdragsgiver}
              sx={{ mt: 1 }}
              aria-label={projectInfo ? 'Oppdater prosjektinfo' : 'Opprett prosjekt'}
            >
              {saving ? <CircularProgress size={24} /> : (projectInfo ? 'Oppdater' : 'Opprett prosjekt')}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  );
}