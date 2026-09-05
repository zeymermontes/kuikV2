import type { FloorTable, FloorCombination, Reservation, ReservationArea } from '@/lib/database.types';

// Demo mode for the host stand (`/host?demo=1`): a sample floor and a busy
// day, held in memory. Lets the dashboard preview the screen and lets a new
// restaurant try it before drawing its own plan. Nothing here touches the DB.

const now = () => new Date();
const iso = (minutesAgo: number) => new Date(now().getTime() - minutesAgo * 60_000).toISOString();
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const inMinutes = (m: number) => {
  const d = new Date(now().getTime() + m * 60_000);
  return { time: hhmm(d), starts_at: d.toISOString() };
};

export function demoAreas(tenantId: string): ReservationArea[] {
  const t = now().toISOString();
  return [
    { id: 'demo-area-main', tenant_id: tenantId, branch_id: null, name: 'Salón', max_covers: null, public_bookable: true, position: 0, created_at: t },
    { id: 'demo-area-patio', tenant_id: tenantId, branch_id: null, name: 'Terraza', max_covers: null, public_bookable: true, position: 1, created_at: t },
  ];
}

export function demoTables(tenantId: string): FloorTable[] {
  const t = now().toISOString();
  const mk = (label: string, seats: number, shape: FloorTable['shape'], x: number, y: number, area = 'demo-area-main', server: string | null = null): FloorTable => ({
    id: `demo-t-${label}`,
    tenant_id: tenantId,
    branch_id: null,
    area_id: area,
    label,
    seats,
    shape,
    x,
    y,
    server_name: server,
    blocked_until: null,
    position: 0,
    created_at: t,
    updated_at: t,
  });
  return [
    mk('11', 4, 'diamond', 1, 0.5, 'demo-area-main', 'Ana'),
    mk('12', 2, 'square', 3.5, 0.5, 'demo-area-main', 'Ana'),
    mk('13', 4, 'rect', 5.5, 0.5, 'demo-area-main', 'Ana'),
    mk('14', 2, 'square', 8.5, 0.5, 'demo-area-main', 'Luis'),
    mk('15', 6, 'rect', 10.5, 0.5, 'demo-area-main', 'Luis'),
    mk('21', 4, 'square', 1, 3),
    mk('22', 4, 'square', 1, 5),
    mk('23', 4, 'square', 1, 7),
    mk('31', 8, 'round', 4, 3.5, 'demo-area-main', 'Luis'),
    mk('32', 8, 'round', 4, 6.5, 'demo-area-main', 'Luis'),
    mk('41', 2, 'square', 7.5, 3),
    mk('42', 2, 'square', 7.5, 5),
    mk('43', 2, 'square', 7.5, 7),
    mk('51', 4, 'square', 10, 3),
    mk('52', 4, 'square', 10, 5),
    mk('53', 4, 'square', 10, 7),
    mk('B1', 1, 'round', 1, 9.5),
    mk('B2', 1, 'round', 2.75, 9.5),
    mk('B3', 1, 'round', 4.5, 9.5),
    mk('B4', 1, 'round', 6.25, 9.5),
    mk('T1', 4, 'square', 1, 0.5, 'demo-area-patio'),
    mk('T2', 4, 'square', 3.5, 0.5, 'demo-area-patio'),
    mk('T3', 6, 'rect', 6, 0.5, 'demo-area-patio'),
  ];
}

export function demoReservations(tenantId: string, day: string): Reservation[] {
  const base = {
    tenant_id: tenantId,
    branch_id: null,
    area_id: 'demo-area-main',
    note: null,
    source: 'form' as const,
    table_ids: [] as string[],
    table_status: 'seated' as const,
    arrived_at: null,
    seated_at: null,
    finished_at: null,
    quoted_minutes: null,
    notified_at: null,
    server_name: null,
    tags: [] as string[],
    turn_minutes: null,
    date: day,
    phone: '+52 55 1234 5678',
  };
  const mk = (id: string, r: Partial<Reservation> & Pick<Reservation, 'customer_name' | 'party_size' | 'status'>, minutesFromNow: number, createdAgo = 120): Reservation => ({
    id: `demo-r-${id}`,
    ...base,
    ...inMinutes(minutesFromNow),
    created_at: iso(createdAgo),
    ...r,
  });
  return [
    mk('1', { customer_name: 'Sofía Cuevas', party_size: 2, status: 'waiting', quoted_minutes: 15, source: 'walkin' }, 0, 9),
    mk('2', { customer_name: 'Mario Hardage', party_size: 5, status: 'notified', quoted_minutes: 20, notified_at: iso(3), source: 'walkin', tags: ['vip'] }, 0, 26),
    mk('3', { customer_name: 'Tomás Mink', party_size: 4, status: 'confirmed', table_ids: ['demo-t-32'], tags: ['birthday'], note: 'Pastel al final, no cantar.' }, -4),
    mk('4', { customer_name: 'Bruno Cuevas', party_size: 2, status: 'confirmed', table_ids: ['demo-t-12'] }, 25),
    mk('5', { customer_name: 'June Ortiz', party_size: 5, status: 'confirmed', source: 'phone' }, 30),
    mk('6', { customer_name: 'Irene Rodríguez', party_size: 4, status: 'arrived', arrived_at: iso(2), table_ids: ['demo-t-21'], tags: ['first_time'] }, 5),
    mk('7', { customer_name: 'Laura Young', party_size: 3, status: 'pending', source: 'bot' }, 60),
    mk('8', { customer_name: 'Pedro Alcántara', party_size: 6, status: 'confirmed' }, -25),
    mk('9', { customer_name: 'Diego Valdés', party_size: 3, status: 'seated', seated_at: iso(12), table_ids: ['demo-t-41'], table_status: 'seated', server_name: 'Ana' }, -12),
    mk('10', { customer_name: 'Carla Méndez', party_size: 4, status: 'seated', seated_at: iso(38), table_ids: ['demo-t-13'], table_status: 'appetizer', server_name: 'Ana' }, -40),
    mk('11', { customer_name: 'Familia Robles', party_size: 8, status: 'seated', seated_at: iso(70), table_ids: ['demo-t-31'], table_status: 'entree', server_name: 'Luis', tags: ['anniversary'] }, -70),
    mk('12', { customer_name: 'Ximena Paz', party_size: 2, status: 'seated', seated_at: iso(95), table_ids: ['demo-t-14'], table_status: 'dessert', server_name: 'Luis' }, -95),
    mk('13', { customer_name: 'Andrés Ruiz', party_size: 4, status: 'seated', seated_at: iso(110), table_ids: ['demo-t-15'], table_status: 'check', server_name: 'Luis' }, -110),
    mk('14', { customer_name: 'Eva Lozano', party_size: 2, status: 'seated', seated_at: iso(75), table_ids: ['demo-t-42'], table_status: 'paid', tags: ['allergy'], note: 'Alergia a nuez' }, -75),
    mk('15', { customer_name: 'Óscar Peña', party_size: 4, status: 'seated', seated_at: iso(125), table_ids: ['demo-t-51'], table_status: 'bussing' }, -125),
    mk('16', { customer_name: 'Karen Byrd', party_size: 2, status: 'finished', seated_at: iso(150), finished_at: iso(20), table_ids: ['demo-t-43'] }, -150),
    mk('17', { customer_name: 'Luis Cooke', party_size: 3, status: 'no_show' }, -90),
  ];
}

export function demoCombinations(tenantId: string): FloorCombination[] {
  const t = now().toISOString();
  return [
    { id: 'demo-c-1', tenant_id: tenantId, area_id: 'demo-area-main', table_ids: ['demo-t-22', 'demo-t-23'], seats: 8, created_at: t },
    { id: 'demo-c-2', tenant_id: tenantId, area_id: 'demo-area-main', table_ids: ['demo-t-52', 'demo-t-53'], seats: 8, created_at: t },
    { id: 'demo-c-3', tenant_id: tenantId, area_id: 'demo-area-patio', table_ids: ['demo-t-T1', 'demo-t-T2'], seats: 8, created_at: t },
  ];
}
