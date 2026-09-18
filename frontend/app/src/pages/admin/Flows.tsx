import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ArrowForwardIcon from '@mui/icons-material/ArrowForwardOutlined';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Panel } from '../../components/Panel';
import { InfoStrip } from '../../components/InfoStrip';

/**
 * A hidden page, like /design-tokens. It is the picture we keep drawing on
 * whiteboards: what happens to a bike, who touches it, and when money moves.
 * Nothing here reads live data — it is documentation that lives next to the
 * code so it cannot drift as quietly as a slide deck does.
 */

type Tone = 'plain' | 'start' | 'end' | 'money';

const TONE_SX: Record<Tone, object> = {
  plain: { borderColor: 'divider', bgcolor: 'background.paper' },
  start: { borderColor: 'primary.main', bgcolor: 'action.hover' },
  end: { borderColor: 'success.main', bgcolor: 'action.hover' },
  money: { borderColor: 'warning.main', bgcolor: 'action.hover' },
};

function Node({ title, note, tone = 'plain', to }: { title: string; note?: string; tone?: Tone; to?: string }) {
  return (
    <Box
      {...(to ? { component: Link, to } : {})}
      sx={{
        border: 1, borderRadius: 2, px: 3, py: 2, minWidth: 150, maxWidth: 260,
        textDecoration: 'none', color: 'inherit', display: 'block', ...TONE_SX[tone],
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{title}</Typography>
      {note && <Typography variant="caption" color="text.secondary">{note}</Typography>}
    </Box>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', alignSelf: 'center' }}>
      <ArrowForwardIcon fontSize="small" />
      {label && <Typography variant="caption">{label}</Typography>}
    </Box>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'stretch', mb: 3 }}>{children}</Box>;
}

export function Flows() {
  return (
    <>
      <PageHeader
        section="Reference"
        title="How the work flows"
      />

      <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
        The same diagrams we draw on the whiteboard. This page is not in the menu — share the address
        when someone needs the whole picture.
      </Typography>

      <Box sx={{ mt: 4 }}>
        <InfoStrip>
          Read each row left to right. Any box you can click is a real screen in this app. Nothing on
          this page reads live data.
        </InfoStrip>
      </Box>

      <Panel label="1. A bike's life" subtitle="Every bike we own moves around this loop." sx={{ mt: 4 }}>
        <Row>
          <Node tone="start" title="New in fleet" note="Just added" to="/vehicles" />
          <Arrow label="passes QC" />
          <Node title="Ready to deploy" note="Free, checked, can go out" />
          <Arrow label="given to a rider" />
          <Node title="With a rider" note="Out on the road" />
        </Row>
        <Row>
          <Node title="With a rider" note="Out on the road" />
          <Arrow label="rider returns it, or it breaks down" />
          <Node title="In service" note="Under repair, QC or accident" to="/service/queues" />
          <Arrow label="work done + QC passed" />
          <Node tone="end" title="Ready to deploy" note="Back in the pool" />
        </Row>
        <Typography variant="body2" color="text.secondary">
          A bike that is beyond repair is marked scrapped and leaves the loop.
        </Typography>
      </Panel>

      <Panel label="2. Taking a bike back from a rider" subtitle="Deboard. The bike comes back; the rider stops paying." sx={{ mt: 4 }}>
        <Row>
          <Node tone="start" title="Deboard rider" note="Screen: pick rider, bike, date" to="/assignments/deboard" />
          <Arrow label="how does the bike look?" />
          <Node title="Say what is damaged" note="Nothing / small / big / accident, plus parts" />
          <Arrow />
          <Node title="Settle the rent owed" note="Rent only. No damage money yet." tone="money" />
          <Arrow />
          <Node tone="end" title="Service job opens" note="Bike lands in the right list" to="/service/queues" />
        </Row>
        <Typography variant="body2" color="text.secondary">
          Why no damage money at deboard: nobody has looked at the bike yet. What the repair costs is
          decided on the service job, after it is checked. If it comes out of the deposit, it is taken
          off then, and the rider is refunded what is left.
        </Typography>
      </Panel>

      <Panel label="3. How a bike reaches service" subtitle="Four doors, one desk." sx={{ mt: 4 }}>
        <Row>
          <Node title="Rider returns the bike" note="Deboard or exchange" />
          <Node title="Rider rides in to the hub" note="Walk-in" />
          <Node title="Breakdown on the road" note="RSA" />
          <Node title="Our team goes out" note="QRT" />
        </Row>
        <Row>
          <Arrow label="all four open a job here" />
          <Node tone="end" title="Take a bike in for service" note="One screen for all of them" to="/service/assistance/new" />
        </Row>
      </Panel>

      <Panel label="4. Inside service" subtitle="A job sits in exactly one list at a time." sx={{ mt: 4 }}>
        <Row>
          <Node tone="start" title="Needs checking" note="Nobody has looked yet" />
          <Arrow label="after looking" />
          <Node title="Small repair / Big repair / Accident" note="The actual work" />
          <Arrow label="if blocked" />
          <Node title="Waiting for parts / Warranty / Insurance" note="Parked, with a reference" />
        </Row>
        <Row>
          <Node title="Repair finished" note="Notes, parts, labour, who did it" />
          <Arrow label="send it for QC" />
          <Node title="QC" note="Last check before it goes back on the road" to="/service/qc" />
          <Arrow label="passed" />
          <Node tone="end" title="Back on the road" note="To the same rider, or Ready to deploy" />
        </Row>
        <Typography variant="body2" color="text.secondary">
          QC failed sends it straight back to repair, and it can come round to QC again. Only a service
          manager or admin can send a bike back out.
        </Typography>
      </Panel>

      <Panel label="5. Where the money goes" subtitle="A repair cost has to land somewhere." sx={{ mt: 4 }}>
        <Row>
          <Node tone="start" title="Job closes" note="Parts + labour add up to one cost" />
          <Arrow label="who pays?" />
          <Node tone="money" title="Take it from the deposit" note="Deposit held goes down" />
          <Node tone="money" title="Rider pays" note="Added to their weekly bill" />
          <Node tone="money" title="Company pays" note="Nothing charged to the rider" />
        </Row>
        <Row>
          <Node title="Rider pays" note="A charge is raised" tone="money" />
          <Arrow label="next weekly run" />
          <Node title="Repair charges column" note="On the rider's bill" to="/payments/run" />
          <Arrow label="not paid in time" />
          <Node title="Old dues" note="Carried to the following week" to="/payments/overdue" />
        </Row>
        <Typography variant="body2" color="text.secondary">
          Nothing is charged while a job is open. The charge is raised once, when the bike goes back out.
        </Typography>
      </Panel>

      <Panel label="6. Who does what" sx={{ mt: 4 }}>
        <Row>
          <Node title="Hub staff" note="Take bikes in, hand them out, deboard riders" />
          <Node title="Workshop" note="Repair, write down costs, run QC" />
          <Node title="Service manager / admin" note="Decides who pays and sends the bike back out" />
          <Node title="Money desk" note="Runs the weekly bill, chases old dues" />
        </Row>
      </Panel>
    </>
  );
}
