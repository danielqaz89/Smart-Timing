"use client";
import { useState, useEffect } from 'react';
import { Button, CircularProgress } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';

const PICKER_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || '';
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

interface GoogleSheetsPickerProps {
  onSheetSelected: (sheetUrl: string, sheetName: string) => void;
  onError?: (error: string) => void;
}

export default function GoogleSheetsPicker({ onSheetSelected, onError }: GoogleSheetsPickerProps) {
  const [pickerReady, setPickerReady] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load Google Picker API script
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already loaded
    if ((window as any).google?.picker) {
      setPickerReady(true);
      return;
    }

    // Load the Picker API
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      (window as any).gapi.load('picker', () => {
        setPickerReady(true);
      });
    };
    script.onerror = () => {
      onError?.('Failed to load Google Picker API');
    };
    document.body.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, [onError]);

  async function openPicker() {
    if (!pickerReady) {
      onError?.('Picker is not ready yet');
      return;
    }

    setLoading(true);

    try {
      // Get access token from backend
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';
      const tokenResponse = await fetch(`${apiBase}/api/auth/google/token?user_id=default`);
      
      if (!tokenResponse.ok) {
        throw new Error('Failed to get access token. Please connect your Google account first.');
      }

      const { accessToken } = await tokenResponse.json();

      // Create and show picker
      const google = (window as any).google;
      const picker = new google.picker.PickerBuilder()
        .addView(
          new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(false)
        )
        .setOAuthToken(accessToken)
        .setDeveloperKey(PICKER_API_KEY)
        .setAppId(CLIENT_ID.split('-')[0]) // Extract app ID from client ID
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const doc = data.docs[0];
            const sheetUrl = doc.url;
            const sheetName = doc.name;
            onSheetSelected(sheetUrl, sheetName);
          } else if (data.action === google.picker.Action.CANCEL) {
            // User cancelled
          }
          setLoading(false);
        })
        .build();

      picker.setVisible(true);
    } catch (error: any) {
      console.error('Picker error:', error);
      onError?.(error.message || 'Failed to open picker');
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outlined"
      startIcon={loading ? <CircularProgress size={20} /> : <FolderOpenIcon />}
      onClick={openPicker}
      disabled={!pickerReady || loading}
    >
      {loading ? 'Opening...' : 'Browse Google Sheets'}
    </Button>
  );
}
