import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { listServiceJobs } from '../../lib/api/serviceJobs';
import { NewAssistanceJob } from './AssistanceJob';

/** Existing jobs go straight to their work record; inspection is not another hop. */
export function Inspection() {
  const [params] = useSearchParams();
  const vehicleId = params.get('vehicle');
  const navigate = useNavigate();
  const jobs = useQuery({ queryKey: ['service-jobs', 'list'], queryFn: () => listServiceJobs() });
  const existing = jobs.data?.find((job) => job.vehicleId === vehicleId && job.status !== 'CLOSED');
  useEffect(() => {
    if (existing) navigate(`/service/assistance/${existing.id}`, { replace: true, state: { returnTo: '/service/queues' } });
  }, [existing, navigate]);
  return <NewAssistanceJob inspectionMode />;
}
