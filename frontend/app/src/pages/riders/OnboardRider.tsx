import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { Mono } from '../../components/Mono';
import { DefinitionList } from '../../components/DefinitionList';
import { listVehicles } from '../../lib/api/vehicles';
import { rupees, formatDate } from '../../lib/format';
import type { Rider } from '../../types';

export function OnboardRider() {
  const { riderId = '' } = useParams();

  const [rider, setRider] = useState<Rider>({
    id: riderId || '',
    name: '',
    phone: '',
    status: 'ACTIVE',
    kycStatus: 'PENDING',
    planAmount: 175000, // ₹1,750 in paise
    billingDay: 'MONDAY',
    currentVehicleId: null,
    onboardedOn: new Date().toISOString().split('T')[0],
    paymentStatus: 'PENDING',
  });

  // Get bikes that are ready to deploy
  const vehicles = useQuery({
    queryKey: ['vehicles', 'ready-to-deploy'],
    queryFn: () => listVehicles({ state: 'READY_TO_DEPLOY' }),
    retry: false,
  });

  if (vehicles.isLoading) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  return (
    <>
      <PageHeader
        section="Riders"
        title="Onboard rider"
        actions={
          <Button component={Link} to="/riders">
            Cancel
          </Button>
        }
      />

      <Box sx={{ mt: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Panel label="Rider details">
          <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              label="Name"
              value={rider.name}
              onChange={(e) => setRider({ ...rider, name: e.target.value })}
              fullWidth
            />
            <TextField
              label="Phone"
              value={rider.phone}
              onChange={(e) => setRider({ ...rider, phone: e.target.value })}
              fullWidth
            />
            <TextField
              select
              label="Status"
              value={rider.status}
              onChange={(e) => setRider({ ...rider, status: e.target.value as Rider['status'] })}
              fullWidth
            >
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="INACTIVE">Inactive</MenuItem>
              <MenuItem value="BLACKLISTED">Blacklisted</MenuItem>
            </TextField>
            <TextField
              select
              label="KYC status"
              value={rider.kycStatus}
              onChange={(e) => setRider({ ...rider, kycStatus: e.target.value as Rider['kycStatus'] })}
              fullWidth
            >
              <MenuItem value="PENDING">Pending</MenuItem>
              <MenuItem value="VERIFIED">Verified</MenuItem>
              <MenuItem value="REJECTED">Rejected</MenuItem>
            </TextField>
            <TextField
              label="Weekly plan (paise)"
              type="number"
              value={rider.planAmount}
              onChange={(e) => setRider({ ...rider, planAmount: Number(e.target.value) })}
              fullWidth
            />
            <TextField
              select
              label="Billing day"
              value={rider.billingDay}
              onChange={(e) => setRider({ ...rider, billingDay: e.target.value as Rider['billingDay'] })}
              fullWidth
            >
              <MenuItem value="MONDAY">Monday</MenuItem>
              <MenuItem value="WEDNESDAY">Wednesday</MenuItem>
            </TextField>
          </Box>
        </Panel>

        <Panel label="Bike assignment">
          <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <TextField
              select
              label="Assign bike"
              value={rider.currentVehicleId ?? ''}
              onChange={(e) => setRider({ ...rider, currentVehicleId: e.target.value || null })}
              fullWidth
            >
              {vehicles.data?.content.length === 0 ? (
                <MenuItem value="" disabled>
                  No bikes available
                </MenuItem>
              ) : (
                vehicles.data?.content.map((bike) => (
                  <MenuItem key={bike.id} value={bike.id}>
                    {bike.id} — {bike.model}
                  </MenuItem>
                ))
              )}
            </TextField>
            <TextField
              label="Onboarded on"
              type="date"
              value={rider.onboardedOn}
              onChange={(e) => setRider({ ...rider, onboardedOn: e.target.value })}
              fullWidth
            />
            <TextField
              label="Deposit (₹)"
              type="number"
              fullWidth
              placeholder="Enter deposit amount"
            />
          </Box>
        </Panel>

        <Panel label="Summary">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Typography variant="overline">Rider registration summary</Typography>
            <DefinitionList
              columns={2}
              items={[
                { label: 'Name', value: <Mono>{rider.name || '—'}</Mono> },
                { label: 'Phone', value: <Mono>{rider.phone || '—'}</Mono> },
                { label: 'Plan (₹)', value: <Mono>{rupees(rider.planAmount)}</Mono> },
                { label: 'Billing', value: <Mono>{rider.billingDay === 'MONDAY' ? 'Monday' : 'Wednesday'}</Mono> },
                { label: 'Bike', value: <Mono>{rider.currentVehicleId || 'Not assigned'}</Mono> },
                { label: 'Onboarded', value: <Mono>{formatDate(rider.onboardedOn)}</Mono> },
              ]}
            />
            <Button
              variant="contained"
              sx={{ mt: 2, width: '100%' }}
              component={Link}
              to={`/riders/${riderId || 'new'}`}
            >
              Complete onboarding
            </Button>
          </Box>
        </Panel>
      </Box>
    </>
  );
}
