/* Canonical band registry. CharacterData.bands lists ids from here; bands[0] is the primary
   unit a dual-affiliation member groups under on the select screen (初华 sings for both
   Ave Mujica and sumimi). A band with no roster members yet stays out of this list until
   someone joins — selfcheck fails on orphan ids and empty bands alike. */

export type BandId =
  | 'mygo' | 'ave-mujica' | 'sumimi' | 'yumemita' | 'pastel-palettes'
  | 'poppin-party' | 'roselia' | 'hello-happy';

export interface BandData {
  id: BandId;
  /** Select-screen group title. */
  name: string;
  /** Unit accent for the group header dot; tracks the members' own roster colours. */
  color: string;
}

export const BANDS: readonly BandData[] = [
  // Select-screen order. Ave Mujica > MyGO!!!!! > 夢限大みゅーたいぷ is the user's pick; the rest
  // follows the franchise debut order (Poppin'Party 2015 → Roselia → Hello, Happy World!), and
  // sumimi sits last among units since it is the anime's idol duo, not an official band.
  { id: 'ave-mujica', name: 'Ave Mujica', color: '#7799CC' },
  { id: 'mygo', name: 'MyGO!!!!!', color: '#77BBDD' },
  { id: 'yumemita', name: '梦限大MewType', color: '#FFEE55' },
  { id: 'poppin-party', name: "Poppin'Party", color: '#FF5522' },
  { id: 'pastel-palettes', name: 'Pastel*Palettes', color: '#FF77CC' },
  { id: 'roselia', name: 'Roselia', color: '#4455BB' },
  { id: 'hello-happy', name: 'Hello, Happy World!', color: '#FFEE22' },
  { id: 'sumimi', name: 'sumimi', color: '#BB9955' },
];

export const BAND_BY_ID: ReadonlyMap<BandId, BandData> = new Map(BANDS.map(b => [b.id, b]));
