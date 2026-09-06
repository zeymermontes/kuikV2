// The SAT catalogues a restaurant actually meets, in the shape the forms need.

export const FISCAL_REGIMES: { code: string; name: string; persona: 'fisica' | 'moral' | 'ambas' }[] = [
  { code: '601', name: 'General de Ley Personas Morales', persona: 'moral' },
  { code: '603', name: 'Personas Morales con Fines no Lucrativos', persona: 'moral' },
  { code: '605', name: 'Sueldos y Salarios e Ingresos Asimilados a Salarios', persona: 'fisica' },
  { code: '606', name: 'Arrendamiento', persona: 'fisica' },
  { code: '608', name: 'Demás ingresos', persona: 'fisica' },
  { code: '610', name: 'Residentes en el Extranjero sin Establecimiento Permanente en México', persona: 'ambas' },
  { code: '611', name: 'Ingresos por Dividendos (socios y accionistas)', persona: 'fisica' },
  { code: '612', name: 'Personas Físicas con Actividades Empresariales y Profesionales', persona: 'fisica' },
  { code: '614', name: 'Ingresos por intereses', persona: 'fisica' },
  { code: '616', name: 'Sin obligaciones fiscales', persona: 'fisica' },
  { code: '620', name: 'Sociedades Cooperativas de Producción', persona: 'moral' },
  { code: '621', name: 'Incorporación Fiscal', persona: 'fisica' },
  { code: '622', name: 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', persona: 'ambas' },
  { code: '623', name: 'Opcional para Grupos de Sociedades', persona: 'moral' },
  { code: '624', name: 'Coordinados', persona: 'moral' },
  { code: '625', name: 'Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', persona: 'fisica' },
  { code: '626', name: 'Régimen Simplificado de Confianza (RESICO)', persona: 'ambas' },
];

export const CFDI_USES: { code: string; name: string }[] = [
  { code: 'G03', name: 'Gastos en general' },
  { code: 'G01', name: 'Adquisición de mercancías' },
  { code: 'D01', name: 'Honorarios médicos, dentales y gastos hospitalarios' },
  { code: 'P01', name: 'Por definir' },
  { code: 'S01', name: 'Sin efectos fiscales' },
  { code: 'CP01', name: 'Pagos' },
];

/** SAT c_FormaPago from how the sale was paid. */
export const PAYMENT_FORMS: Record<string, string> = {
  cash: '01',
  card: '04',
  transfer: '03',
  other: '99',
  online: '04',
  onsite: '01',
};

export const PAYMENT_FORM_NAMES: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Cheque nominativo',
  '03': 'Transferencia electrónica de fondos',
  '04': 'Tarjeta de crédito',
  '28': 'Tarjeta de débito',
  '99': 'Por definir',
};

/** The receiver of a global CFDI, as the SAT prescribes. */
export const PUBLICO_EN_GENERAL = { rfc: 'XAXX010101000', name: 'PUBLICO EN GENERAL', regime: '616', use: 'S01' } as const;

const RFC_RE = /^([A-ZÑ&]{3,4})(\d{6})([A-Z0-9]{3})$/;

/** A syntactically valid RFC (persona física 13, moral 12), upper-cased. */
export function normalizeRfc(input: string): string | null {
  const rfc = input.trim().toUpperCase().replace(/\s|-/g, '');
  if (rfc.length !== 12 && rfc.length !== 13) return null;
  return RFC_RE.test(rfc) ? rfc : null;
}

export function isValidZip(z: string): boolean {
  return /^\d{5}$/.test(z.trim());
}
