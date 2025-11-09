'use client';

import { Box, Card, CardContent, Typography, Tooltip } from '@mui/material';
import { TrendingUp, TrendingDown, TrendingFlat } from '@mui/icons-material';
import { ReactNode } from 'react';

interface StatCardWithTrendProps {
  title: string;
  value: number | string;
  icon: ReactNode;
  color: string;
  trend?: {
    value: number; // Percentage change
    isPositive: boolean;
    previousValue?: number;
  };
}

export default function StatCardWithTrend({ 
  title, 
  value, 
  icon, 
  color,
  trend 
}: StatCardWithTrendProps) {
  const getTrendIcon = () => {
    if (!trend) return null;
    
    if (trend.value === 0) {
      return <TrendingFlat sx={{ fontSize: 20, color: 'text.secondary' }} />;
    }
    
    return trend.isPositive ? (
      <TrendingUp sx={{ fontSize: 20, color: 'success.main' }} />
    ) : (
      <TrendingDown sx={{ fontSize: 20, color: 'error.main' }} />
    );
  };

  const getTrendColor = () => {
    if (!trend || trend.value === 0) return 'text.secondary';
    return trend.isPositive ? 'success.main' : 'error.main';
  };

  const formatPercentage = (val: number) => {
    const abs = Math.abs(val);
    const sign = val > 0 ? '+' : '';
    return `${sign}${abs.toFixed(1)}%`;
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ flex: 1 }}>
            <Typography color="text.secondary" variant="body2" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h3" sx={{ mb: trend ? 0.5 : 0 }}>
              {value}
            </Typography>
            
            {trend && (
              <Tooltip 
                title={`Sammenlignet med forrige periode (${trend.previousValue || 0})`}
                arrow
              >
                <Box 
                  sx={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: 0.5,
                    cursor: 'help'
                  }}
                >
                  {getTrendIcon()}
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: getTrendColor(),
                      fontWeight: 600 
                    }}
                  >
                    {formatPercentage(trend.value)}
                  </Typography>
                </Box>
              </Tooltip>
            )}
          </Box>
          <Box sx={{ color }}>{icon}</Box>
        </Box>
      </CardContent>
    </Card>
  );
}
