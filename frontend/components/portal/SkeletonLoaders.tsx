"use client";
import { Box, Card, CardContent, Skeleton, Stack, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";

export function CardSkeleton() {
  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Skeleton variant="text" width="60%" height={32} />
          <Skeleton variant="rectangular" height={80} />
          <Stack direction="row" spacing={1}>
            <Skeleton variant="rectangular" width={100} height={36} />
            <Skeleton variant="rectangular" width={100} height={36} />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          {[1, 2, 3, 4, 5].map((i) => (
            <TableCell key={i}>
              <Skeleton variant="text" width="80%" />
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {[1, 2, 3, 4, 5].map((i) => (
              <TableCell key={i}>
                <Skeleton variant="text" width={`${60 + Math.random() * 40}%`} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function StatCardSkeleton() {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="60%" height={24} />
            <Skeleton variant="text" width="40%" height={48} />
          </Box>
          <Skeleton variant="circular" width={56} height={56} />
        </Box>
      </CardContent>
    </Card>
  );
}

export function DashboardSkeleton() {
  return (
    <Box>
      <Skeleton variant="text" width="30%" height={48} sx={{ mb: 3 }} />
      <Stack spacing={3}>
        {[1, 2, 3].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </Stack>
    </Box>
  );
}
